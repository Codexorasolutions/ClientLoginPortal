import Receipt from '../models/Receipt.js';
import { validateReceiptInput } from '../utils/receiptCore.js';
import { renderReceiptPdf } from '../utils/receiptPdf.js';
import { createReceipt, voidReceipt, listReceipts, getReceiptContext, receiptForInvoice, serialize, httpError } from '../utils/receipt.js';
import { logAudit } from '../utils/audit.js';
import { inr } from '../utils/receiptCore.js';
import mongoose from 'mongoose';

const fail = (res, err) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({
    message: err.status ? err.message : 'Something went wrong. Please try again.',
    code: err.code, errors: err.errors, existing: err.existing,
  });
};

const pdfHeaders = (res, receipt, download) => {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${receipt.receiptNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
};

export const sendReceiptPdfFor = async (res, receipt, { download = true } = {}) => {
  const pdf = await renderReceiptPdf(receipt);
  pdfHeaders(res, receipt, download);
  res.set('Content-Length', pdf.length);
  res.send(pdf);
};

// GET /api/owner/clients/:id/receipt-context — everything the "Create receipt" form pre-fills from
export const receiptContext = async (req, res) => {
  try { res.json(await getReceiptContext(req.params.id)); } catch (err) { fail(res, err); }
};

// GET /api/owner/receipts?q=&mode=&status=&from=&to=&client=&page=&limit=
export const listOwnerReceipts = async (req, res) => {
  try { res.json(await listReceipts(req.query)); } catch (err) { fail(res, err); }
};

// GET /api/owner/receipts/:id
export const getOwnerReceipt = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Receipt not found');
    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) throw httpError(404, 'Receipt not found');
    res.json({ receipt: serialize(receipt) });
  } catch (err) { fail(res, err); }
};

// POST /api/owner/receipts
export const createOwnerReceipt = async (req, res) => {
  const { value, errors } = validateReceiptInput(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please fix the highlighted fields', errors });
  try {
    const { receipt, replay } = await createReceipt({ input: value, actor: req.user });
    if (!replay) {
      await logAudit(req, 'receipt.create', {
        entityType: 'receipt', entityId: receipt._id, entityLabel: receipt.receiptNumber,
        summary: `Receipt ${receipt.receiptNumber} created — ₹${inr(receipt.amountReceived)} from ${receipt.clientBusiness || receipt.clientName}`,
        meta: { amount: receipt.amountReceived, balanceDue: receipt.balanceDue, mode: receipt.paymentMode, reference: receipt.transactionId, invoice: receipt.invoice ? String(receipt.invoice) : undefined },
      });
    }
    res.status(replay ? 200 : 201).json({ receipt: serialize(receipt), replay });
  } catch (err) { fail(res, err); }
};

// POST /api/owner/receipts/:id/void  { reason }
export const voidOwnerReceipt = async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return res.status(400).json({ message: 'Give a short reason for cancelling this receipt', errors: { reason: 'Required (at least 3 characters)' } });
  try {
    const receipt = await voidReceipt(req.params.id, req.user, reason);
    await logAudit(req, 'receipt.void', {
      entityType: 'receipt', entityId: receipt._id, entityLabel: receipt.receiptNumber,
      summary: `Receipt ${receipt.receiptNumber} cancelled — ₹${inr(receipt.amountReceived)} removed from the project's payments`, meta: { reason: receipt.voidReason },
    });
    res.json({ receipt: serialize(receipt) });
  } catch (err) { fail(res, err); }
};

// GET /api/owner/receipts/:id/pdf[?download=1] — inline for Preview / Print, attachment for Download
export const ownerReceiptPdf = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'Receipt not found');
    const receipt = await Receipt.findById(req.params.id);
    if (!receipt) throw httpError(404, 'Receipt not found');
    const download = req.query.download === '1';
    if (download) await logAudit(req, 'receipt.generate', { entityType: 'receipt', entityId: receipt._id, entityLabel: receipt.receiptNumber });
    await sendReceiptPdfFor(res, receipt, { download });
  } catch (err) { if (res.headersSent) console.error(err); else fail(res, err); }
};

// the existing per-invoice "Receipt" buttons (owner + client) go through the same saved record
export const sendInvoiceReceipt = async (req, res, invoice) => {
  try {
    if (invoice.status !== 'paid') return res.status(400).json({ message: 'A receipt is only available once the invoice is marked paid.' });
    const receipt = await receiptForInvoice(invoice, req.user);
    if (!receipt) return res.status(409).json({ message: 'Could not prepare the receipt for this invoice. Please contact Codexora.' });
    if (req.user.role === 'owner') await logAudit(req, 'receipt.generate', { entityType: 'receipt', entityId: receipt._id, entityLabel: receipt.receiptNumber });
    await sendReceiptPdfFor(res, receipt, { download: true });
  } catch (err) { if (res.headersSent) console.error(err); else fail(res, err); }
};
