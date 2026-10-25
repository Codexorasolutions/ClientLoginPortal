// Receipt records: create / cancel / list / context. Everything that touches the database lives here;
// the maths and validation are in receiptCore.js and the drawing is in receiptPdf.js.
import mongoose from 'mongoose';
import Receipt from '../models/Receipt.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';
import User from '../models/User.js';
import { getSettings } from './settings.js';
import { notifyUser } from './notify.js';
import { logActivity } from './activity.js';
import { invoiceLabel } from './invoiceNumber.js';
import {
  computeTotals, computeNextReceiptNumber, verificationId, toPaise, fromPaise, inr, normaliseRef, todayIST,
} from './receiptCore.js';

export const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const day = (d) => new Date(d).toISOString().slice(0, 10);

// ---------- ledger helpers (all in integer paise) ----------
// What the client has paid so far = live receipts + invoices that were marked paid BEFORE receipts existed
// (those have no receipt yet, but the money is real and must count towards the balance).
async function receivedPaise(clientId, { excludeInvoiceId } = {}) {
  const [receipts, paidInvoices] = await Promise.all([
    Receipt.find({ client: clientId, voided: false }).select('amountReceived invoice'),
    Invoice.find({ client: clientId, status: 'paid' }).select('amount'),
  ]);
  const covered = new Set(receipts.filter((r) => r.invoice).map((r) => String(r.invoice)));
  const fromReceipts = receipts.reduce((s, r) => s + toPaise(r.amountReceived), 0);
  const legacy = paidInvoices
    .filter((i) => !covered.has(String(i._id)) && String(i._id) !== String(excludeInvoiceId))
    .reduce((s, i) => s + toPaise(i.amount), 0);
  return fromReceipts + legacy;
}

// everything collected across ALL clients (live receipts + old paid invoices that have no receipt)
export async function totalCollected() {
  const [receipts, paidInvoices] = await Promise.all([
    Receipt.find({ voided: false }).select('amountReceived invoice'),
    Invoice.find({ status: 'paid' }).select('amount'),
  ]);
  const covered = new Set(receipts.filter((r) => r.invoice).map((r) => String(r.invoice)));
  const total = receipts.reduce((s, r) => s + toPaise(r.amountReceived), 0)
    + paidInvoices.filter((i) => !covered.has(String(i._id))).reduce((s, i) => s + toPaise(i.amount), 0);
  return fromPaise(total);
}

// total price of the project: the owner's figure when set, otherwise (older clients) everything billed so far
async function totalCostFor(project, clientId) {
  if (project?.totalCost > 0) return { total: project.totalCost, set: true };
  const invoices = await Invoice.find({ client: clientId }).select('amount');
  return { total: fromPaise(invoices.reduce((s, i) => s + toPaise(i.amount), 0)), set: false };
}

export async function paymentSummary(clientId) {
  const project = await Project.findOne({ client: clientId });
  const { total, set } = await totalCostFor(project, clientId);
  const received = fromPaise(await receivedPaise(clientId));
  return { totalCost: total, totalCostSet: set, received, balance: fromPaise(toPaise(total) - toPaise(received)), project };
}

// ---------- context for the create form ----------
export async function getReceiptContext(clientId) {
  if (!mongoose.isValidObjectId(clientId)) throw httpError(404, 'Client not found');
  const client = await User.findOne({ _id: clientId, role: 'client' }).select('fullName businessName phone email clientId');
  if (!client) throw httpError(404, 'Client not found');
  const [summary, dueInvoices, settings] = await Promise.all([
    paymentSummary(client._id),
    Invoice.find({ client: client._id, status: 'due' }).sort({ createdAt: -1 }).select('invoiceNumber description amount dueDate'),
    getSettings(),
  ]);
  return {
    client: { _id: client._id, fullName: client.fullName, businessName: client.businessName, phone: client.phone, email: client.email, clientId: client.clientId },
    project: summary.project ? { _id: summary.project._id, name: summary.project.name, planLabel: summary.project.planLabel, totalCost: summary.project.totalCost || null } : null,
    summary: { totalCost: summary.totalCost, totalCostSet: summary.totalCostSet, received: summary.received, balance: summary.balance },
    dueInvoices: dueInvoices.map((i) => ({ _id: i._id, label: invoiceLabel(i), description: i.description, amount: i.amount, dueDate: i.dueDate })),
    defaults: { notes: settings.receipt.notes || '' },
  };
}

// ---------- create ----------
const issuerSnapshot = async () => {
  const s = await getSettings();
  const b = s.business;
  return {
    name: b.name, address: b.address, email: b.email, phone: b.phone, whatsapp: b.whatsapp, website: b.website,
    instagram: b.instagram, linkedin: b.linkedin, gstin: b.gstin, pan: b.pan, upiId: b.upiId, bankDetails: b.bankDetails,
    thankYou: s.receipt.thankYou, stampText: s.receipt.stampText,
  };
};

async function assertNotDuplicate(clientId, input) {
  const existing = await Receipt.find({ client: clientId, voided: false }).select('receiptNumber transactionId amountReceived paymentDate paymentMode');
  const ref = normaliseRef(input.transactionId);
  if (ref) {
    const hit = existing.find((r) => normaliseRef(r.transactionId) === ref);
    if (hit) throw httpError(409, `A receipt (${hit.receiptNumber}) already exists for transaction ID "${input.transactionId}". The same payment cannot be recorded twice.`, { code: 'duplicate_transaction', existing: { _id: hit._id, receiptNumber: hit.receiptNumber } });
  }
  if (!input.confirmDuplicate) {
    const hit = existing.find((r) => toPaise(r.amountReceived) === toPaise(input.amountReceived) && day(r.paymentDate) === day(input.paymentDate) && r.paymentMode === input.paymentMode);
    if (hit) throw httpError(409, `${hit.receiptNumber} already records ₹${inr(hit.amountReceived)} by ${hit.paymentMode} on the same date. If this is a different payment, confirm to create it anyway.`, { code: 'possible_duplicate', existing: { _id: hit._id, receiptNumber: hit.receiptNumber } });
  }
}

const revertInvoice = (invoiceId) =>
  Invoice.updateOne({ _id: invoiceId }, { $set: { status: 'due' }, $unset: { paidAt: 1, paymentMode: 1, transactionId: 1 } });

/**
 * Saves a receipt and updates the project's totals.
 *  input  = output of validateReceiptInput().value (manual) — or built from a paid invoice (auto)
 *  auto   = the receipt documents a payment that already exists (an invoice marked paid): never blocked by the balance rule
 */
export async function createReceipt({ input, actor, auto = false, invoiceDoc = null }) {
  if (!mongoose.isValidObjectId(input.clientId)) throw httpError(400, 'Choose a client');
  const client = await User.findOne({ _id: input.clientId, role: 'client' });
  if (!client) throw httpError(404, 'Client not found');
  const project = await Project.findOne({ client: client._id });
  if (!project && !auto) throw httpError(400, "This client has no project yet. Create it first (Clients → select the client → Project), then record the payment.", { code: 'no_project' });

  // the same request sent twice (double-click, retry) returns the first receipt
  if (input.idempotencyKey) {
    const same = await Receipt.findOne({ idempotencyKey: input.idempotencyKey });
    if (same) return { receipt: same, replay: true };
  }
  const idempotencyKey = input.idempotencyKey || `srv-${new mongoose.Types.ObjectId()}`;

  if (!auto) await assertNotDuplicate(client._id, input);

  // settle the invoice atomically FIRST: only one request can ever win it, so an invoice can't get two receipts
  let invoice = invoiceDoc;
  let claimed = false;
  if (!auto && input.invoiceId) {
    if (!mongoose.isValidObjectId(input.invoiceId)) throw httpError(400, 'Invalid invoice');
    const inv = await Invoice.findOne({ _id: input.invoiceId, client: client._id });
    if (!inv) throw httpError(404, 'That invoice does not belong to this client');
    if (toPaise(inv.amount) !== toPaise(input.amountReceived)) {
      throw httpError(400, `This receipt settles invoice ${invoiceLabel(inv)}, so its total must be exactly ₹${inr(inv.amount)}. To record a part payment, leave "Settles invoice" empty.`, { code: 'invoice_amount_mismatch' });
    }
    invoice = await Invoice.findOneAndUpdate(
      { _id: inv._id, client: client._id, status: 'due' },
      { $set: { status: 'paid', paidAt: input.paymentDate, paymentMode: input.paymentMode, transactionId: input.transactionId || undefined } },
      { returnDocument: 'after' }
    );
    if (!invoice) throw httpError(409, `Invoice ${invoiceLabel(inv)} is already paid.`, { code: 'invoice_not_due' });
    claimed = true;
  }

  try {
    // totals — re-checked if another receipt for this project is saved at the same moment
    let totals = null, totalCostUsed = 0;
    for (let attempt = 0; attempt < 4 && !totals; attempt += 1) {
      const fresh = project ? await Project.findById(project._id) : null;
      const version = fresh?.receiptsVersion || 0;
      const base = input.totalProjectCost ?? (await totalCostFor(fresh, client._id)).total;
      // the invoice this receipt settles is already 'paid' at this point — it must not be counted twice
      const before = fromPaise(await receivedPaise(client._id, { excludeInvoiceId: invoice?._id }));
      let t = computeTotals({ totalCost: base, receivedBefore: before, amount: input.amountReceived, allowOverpayment: input.allowOverpayment });
      let used = base;
      if (!t.ok && auto && t.code === 'exceeds_balance') {   // a payment that really happened is always recorded
        used = fromPaise(toPaise(before) + toPaise(input.amountReceived));
        t = computeTotals({ totalCost: used, receivedBefore: before, amount: input.amountReceived, allowOverpayment: true });
      }
      if (!t.ok) throw httpError(400, t.message, { code: t.code, errors: t.code === 'exceeds_balance' ? { amountReceived: t.message } : undefined });

      if (!fresh) { totals = { ...t, before }; totalCostUsed = used; continue; } // old invoice with no project: nothing to lock
      const filter = version === 0 ? { _id: fresh._id, $or: [{ receiptsVersion: 0 }, { receiptsVersion: { $exists: false } }] } : { _id: fresh._id, receiptsVersion: version };
      const update = { $inc: { receiptsVersion: 1 } };
      if (!auto && input.totalProjectCost !== undefined && input.totalProjectCost !== fresh.totalCost) update.$set = { totalCost: input.totalProjectCost };
      const res = await Project.updateOne(filter, update);
      if (res.matchedCount === 1) { totals = { ...t, before }; totalCostUsed = used; }
    }
    if (!totals) throw httpError(409, 'Another payment was being saved for this project at the same moment. Please try again.', { code: 'busy' });

    const issuer = await issuerSnapshot();
    const year = Number(todayIST().slice(0, 4));
    let receipt = null;
    for (let attempt = 0; attempt < 6 && !receipt; attempt += 1) {
      const last = await Receipt.findOne({ receiptNumber: new RegExp(`^RCT-${year}-`) }).sort({ receiptNumber: -1 }).select('receiptNumber');
      const receiptNumber = computeNextReceiptNumber(last?.receiptNumber, year);
      try {
        receipt = await Receipt.create({
          receiptNumber, client: client._id, project: project?._id, invoice: invoice?._id,
          clientName: input.clientName, clientBusiness: input.clientBusiness, clientPhone: input.clientPhone, clientEmail: input.clientEmail,
          paymentMode: input.paymentMode, transactionId: input.transactionId || undefined, paymentDate: input.paymentDate,
          projectPlan: input.projectPlan, items: input.items, amountReceived: input.amountReceived,
          totalProjectCost: totalCostUsed, receivedBefore: totals.before, receivedToDate: totals.receivedToDate, balanceDue: totals.balanceDue,
          allowOverpayment: !!input.allowOverpayment, status: totals.status, notes: input.notes || undefined,
          verification: {
            id: verificationId({ receiptNumber, amount: input.amountReceived, paymentDate: input.paymentDate, clientId: client._id }),
            signedAt: new Date(), signedBy: actor?._id,
          },
          issuer, idempotencyKey, source: auto ? 'invoice' : 'manual', createdBy: actor?._id,
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        if (/idempotencyKey/.test(JSON.stringify(err.keyPattern || err.message))) {
          const winner = await Receipt.findOne({ idempotencyKey });
          if (winner) return { receipt: winner, replay: true };
        }
        // otherwise the receipt number was taken a moment ago — loop and take the next one
      }
    }
    if (!receipt) throw httpError(409, 'Could not reserve a receipt number. Please try again.', { code: 'busy' });

    if (claimed) {
      const label = invoiceLabel(invoice);
      await notifyUser(client._id, { title: 'Payment received', message: `Thank you — ${invoice.description} (₹${inr(invoice.amount)}) is marked as paid.`, type: 'invoice' }).catch(() => {});
      await logActivity(client._id, 'invoice', `Payment received for "${invoice.description}" — ₹${inr(invoice.amount)} (${label}).`).catch(() => {});
    }
    return { receipt, replay: false };
  } catch (err) {
    if (claimed) await revertInvoice(invoice._id).catch(() => {});   // nothing was saved, so the invoice goes back to "due"
    throw err;
  }
}

// ---------- cancel ----------
// Receipts are never deleted. Cancelling removes the payment from the project's totals.
export async function voidReceipt(receiptId, actor, reason, { revertInvoiceStatus = true } = {}) {
  if (!mongoose.isValidObjectId(receiptId)) throw httpError(404, 'Receipt not found');
  const existing = await Receipt.findById(receiptId);
  if (!existing) throw httpError(404, 'Receipt not found');
  if (existing.voided) throw httpError(409, `${existing.receiptNumber} is already cancelled.`);

  const receipt = await Receipt.findOneAndUpdate(
    { _id: receiptId, voided: false },
    { $set: { voided: true, voidedAt: new Date(), voidedBy: actor?._id, voidReason: String(reason || '').trim().slice(0, 200) || undefined } },
    { returnDocument: 'after' }
  );
  if (!receipt) throw httpError(409, 'This receipt was just cancelled.');
  if (receipt.project) await Project.updateOne({ _id: receipt.project }, { $inc: { receiptsVersion: 1 } });
  if (receipt.invoice && revertInvoiceStatus) {
    await revertInvoice(receipt.invoice);
    await logActivity(receipt.client, 'invoice', `Receipt ${receipt.receiptNumber} was cancelled; the invoice is open again.`).catch(() => {});
  }
  return receipt;
}

// ---------- the receipt of an invoice (used by the existing "Receipt" buttons) ----------
export async function receiptForInvoice(invoice, actor) {
  const live = await Receipt.findOne({ invoice: invoice._id, voided: false });
  if (live) return live;
  if (invoice.status !== 'paid') return null;

  // invoice was paid before receipts existed (or its receipt was cancelled): write the record now
  const [client, project, count] = await Promise.all([
    User.findById(invoice.client), Project.findOne({ client: invoice.client }), Receipt.countDocuments({ invoice: invoice._id }),
  ]);
  if (!client) return null;
  const { receipt } = await createReceipt({
    auto: true, invoiceDoc: invoice, actor,
    input: {
      clientId: String(invoice.client), clientName: client.fullName, clientBusiness: client.businessName || '', clientPhone: client.phone || '', clientEmail: client.email || '',
      paymentMode: invoice.paymentMode || 'Other', transactionId: invoice.transactionId || '', paymentDate: invoice.paidAt || invoice.updatedAt || new Date(),
      projectPlan: project?.planLabel || '', items: [{ description: invoice.description, amount: invoice.amount }], amountReceived: invoice.amount,
      notes: (await getSettings()).receipt.notes || '', // receipts made automatically carry the default note from Settings
      allowOverpayment: true, idempotencyKey: `invoice-${invoice._id}-${count}`,
    },
  });
  return receipt;
}

// owner edited an invoice's payment details -> keep its live receipt in step
export async function syncInvoiceDetails(invoice) {
  const set = { paymentMode: invoice.paymentMode || 'Other' };
  const update = invoice.transactionId ? { $set: { ...set, transactionId: invoice.transactionId } } : { $set: set, $unset: { transactionId: 1 } };
  await Receipt.updateOne({ invoice: invoice._id, voided: false }, update);
}

// ---------- list / search ----------
export const statusKey = (r) => (r.voided ? 'cancelled' : r.status);

export function serialize(r) {
  const o = r.toObject ? r.toObject() : r;
  const { issuer, idempotencyKey, __v, ...rest } = o;
  return { ...rest, statusKey: statusKey(o) };
}

export async function listReceipts(q = {}) {
  const filter = {};
  if (q.client && mongoose.isValidObjectId(q.client)) filter.client = q.client;
  if (q.mode) filter.paymentMode = String(q.mode);
  if (q.status === 'cancelled') filter.voided = true;
  else if (['paid_in_full', 'part_payment', 'unpaid'].includes(q.status)) { filter.voided = false; filter.status = q.status; }
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? new Date(`${q.from}T00:00:00.000Z`) : null;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? new Date(`${q.to}T23:59:59.999Z`) : null;
  if (from || to) filter.paymentDate = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const text = String(q.q || '').trim().slice(0, 80);
  if (text) {
    const rx = new RegExp(escapeRegex(text), 'i');
    filter.$or = [{ receiptNumber: rx }, { clientName: rx }, { clientBusiness: rx }, { transactionId: rx }, { 'verification.id': rx }];
  }
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  const page = Math.max(1, parseInt(q.page, 10) || 1);

  const [items, total, live] = await Promise.all([
    Receipt.find(filter).sort({ paymentDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Receipt.countDocuments(filter),
    Receipt.find({ ...filter, voided: false }).select('amountReceived'),
  ]);
  const amount = fromPaise(live.reduce((s, r) => s + toPaise(r.amountReceived), 0));
  return { items: items.map(serialize), total, page, pages: Math.max(1, Math.ceil(total / limit)), totals: { count: live.length, amount } };
}
