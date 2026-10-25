import mongoose from 'mongoose';
import User from '../models/User.js';
import SupportTicket from '../models/SupportTicket.js';
import Activity from '../models/Activity.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';
import Deliverable from '../models/Deliverable.js';
import sendEmail from '../utils/sendEmail.js';
import generateClientId from '../utils/generateClientId.js';
import { uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { notifyUser } from '../utils/notify.js';
import { logActivity } from '../utils/activity.js';
import { withThumbnail } from '../utils/thumbnail.js';
import { computeNextNumber, invoiceLabel } from '../utils/invoiceNumber.js';
import { sendInvoicePdf } from '../utils/invoicePdf.js';
import Receipt from '../models/Receipt.js';
import { receiptForInvoice, voidReceipt, syncInvoiceDetails, paymentSummary, serialize as serializeReceipt } from '../utils/receipt.js';
import { sendInvoiceReceipt } from './receiptController.js';
import { renderEmail } from '../utils/settings.js';
import { approveUser, rejectUser } from '../utils/userActions.js';
import { logAudit } from '../utils/audit.js';
import { diffObjects } from '../utils/auditCore.js';

const PAYMENT_MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'];
const clientLabel = (u) => u.businessName || u.fullName;

// GET /api/owner/pending-requests
export const listPendingRequests = async (req, res) => {
  try {
    const requests = await User.find({
      role: 'client',
      isEmailVerified: true,
      approvalStatus: 'pending',
    })
      .select('-password -otp -otpExpires -resetToken -resetTokenExpires -tokenVersion -statusHistory')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not fetch pending requests', error: err.message });
  }
};

// POST /api/owner/approve/:id
export const approveRequest = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Request not found' });
    const { clientId, emailSent } = await approveUser(user, req.user, req);
    res.json({ message: 'Client approved', clientId, emailSent });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ message: 'Approval failed', error: err.message });
  }
};

// POST /api/owner/reject/:id
export const rejectRequest = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Request not found' });
    const { emailSent } = await rejectUser(user, req.user, req, req.body?.reason);
    res.json({ message: 'Request rejected', emailSent });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ message: 'Rejection failed', error: err.message });
  }
};

// POST /api/owner/clients/:clientId/deliverables — owner shares a file
// with a specific client. Full owner project/invoice management arrives
// in Module 7; this one endpoint exists now so the real Cloudinary path
// can be tested end to end from the client dashboard in Module 6.
export const uploadDeliverable = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { name, type, versionLabel } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({
        message: 'File storage is not configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in backend/.env, then restart the backend.',
      });
    }

    const client = await User.findOne({ _id: clientId, role: 'client' });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const displayName = (name || req.file.originalname).trim();

    // same name (case-insensitive) = another version of the same deliverable,
    // so an unlabeled upload is numbered automatically: v1, v2, v3...
    const existing = await Deliverable.countDocuments(
      { client: clientId, name: displayName },
      { collation: { locale: 'en', strength: 2 } }
    );
    const label = (versionLabel || '').trim() || `v${existing + 1}`;

    const allowedTypes = ['Preview link', 'Document', 'Image', 'Other'];
    const project = await Project.findOne({ client: clientId });
    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype);

    const deliverable = await Deliverable.create({
      client: clientId,
      project: project?._id,
      name: displayName,
      type: allowedTypes.includes(type) ? type : 'Other',
      versionLabel: label,
      url: result.secure_url,
    });

    await notifyUser(clientId, {
      title: 'New file shared',
      message: `${deliverable.name} (${label}) was added to your Files & deliverables.`,
      type: 'deliverable',
    });
    await logActivity(clientId, 'deliverable', `New file shared: ${deliverable.name} (${label}).`);
    await logAudit(req, 'file.upload', { entityType: 'client', entityId: clientId, entityLabel: clientLabel(client), summary: `File shared with ${clientLabel(client)}: ${deliverable.name} (${label})`, meta: { type: deliverable.type } });

    res.status(201).json({ message: 'File shared with client', deliverable: withThumbnail(deliverable) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
};

// GET /api/owner/overview — stat cards for the owner dashboard's Overview tab
export const getOverview = async (req, res) => {
  try {
    const activeClients = await User.countDocuments({ role: 'client', approvalStatus: 'approved' });
    const pendingApprovals = await User.countDocuments({
      role: 'client',
      isEmailVerified: true,
      approvalStatus: 'pending',
    });
    const activeProjects = await Project.countDocuments({ stage: { $ne: 'live' } });
    const outstanding = await Invoice.aggregate([
      { $match: { status: 'due' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    res.json({
      activeClients,
      pendingApprovals,
      activeProjects,
      outstandingInvoices: outstanding[0]?.total || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load overview', error: err.message });
  }
};

// GET /api/owner/clients — every approved client with a project/invoice summary
export const listClients = async (req, res) => {
  try {
    const clients = await User.find({ role: 'client', approvalStatus: 'approved' })
      .select('-password -otp -otpExpires -resetToken -resetTokenExpires -tokenVersion -statusHistory')
      .sort({ createdAt: -1 });

    const withSummary = await Promise.all(
      clients.map(async (client) => {
        const project = await Project.findOne({ client: client._id });
        const dueInvoices = await Invoice.find({ client: client._id, status: 'due' });
        const balanceDue = dueInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        return {
          ...client.toObject(),
          projectStage: project?.stage || null,
          balanceDue,
        };
      })
    );

    res.json({ clients: withSummary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load clients', error: err.message });
  }
};

// GET /api/owner/clients/:id — full detail for one client
export const getClientDetail = async (req, res) => {
  try {
    const client = await User.findOne({ _id: req.params.id, role: 'client' }).select(
      '-password -otp -otpExpires -resetToken -resetTokenExpires -tokenVersion -statusHistory'
    );
    if (!client) return res.status(404).json({ message: 'Client not found' });

    const project = await Project.findOne({ client: client._id });
    const invoices = await Invoice.find({ client: client._id }).sort({ createdAt: -1 });
    const deliverables = await Deliverable.find({ client: client._id }).sort({ createdAt: -1 });

    const [summary, receipts] = await Promise.all([
      paymentSummary(client._id),
      Receipt.find({ client: client._id }).sort({ paymentDate: -1, createdAt: -1 }).limit(100),
    ]);
    const payments = { totalCost: summary.totalCost, totalCostSet: summary.totalCostSet, received: summary.received, balance: summary.balance };

    res.json({ client, project, invoices, deliverables: deliverables.map(withThumbnail), payments, receipts: receipts.map(serializeReceipt) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load client', error: err.message });
  }
};

// POST /api/owner/clients/:id/project — create the client's project if it
// doesn't exist yet, or update it if it does (one project per client)
export const upsertProject = async (req, res) => {
  try {
    const { name, planLabel, stage, nextMilestoneLabel, nextMilestoneDate, stagingUrl, statusNote, totalCost } = req.body;
    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    // only http(s) links — blocks things like javascript: URLs, since this
    // value is rendered as a clickable link on the client's dashboard
    if (stagingUrl && !/^https?:\/\//i.test(stagingUrl)) {
      return res.status(400).json({ message: 'Staging URL must start with http:// or https://' });
    }

    // agreed project price (₹) — the base for payment receipts. Empty = leave unchanged.
    let cost;
    if (totalCost !== undefined && totalCost !== null && totalCost !== '') {
      cost = Number(totalCost);
      if (!Number.isFinite(cost) || cost <= 0 || Math.abs(cost * 100 - Math.round(cost * 100)) > 1e-6 || cost > 1_000_000_000) {
        return res.status(400).json({ message: 'Total project cost must be an amount above ₹0 with at most 2 decimals' });
      }
    }

    const before = await Project.findOne({ client: client._id });
    const noteWillChange = statusNote !== undefined && (statusNote || '') !== (before?.statusNote || '');

    const project = await Project.findOneAndUpdate(
      { client: client._id },
      {
        client: client._id,
        ...(name && { name }),
        ...(planLabel && { planLabel }),
        ...(stage && { stage }),
        ...(nextMilestoneLabel !== undefined && { nextMilestoneLabel }),
        ...(nextMilestoneDate !== undefined && { nextMilestoneDate: nextMilestoneDate || null }),
        ...(stagingUrl !== undefined && { stagingUrl }),
        ...(statusNote !== undefined && { statusNote }),
        ...(cost !== undefined && { totalCost: cost }),
        ...(noteWillChange && { statusNoteUpdatedAt: new Date() }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // announce only what actually changed, so one save never sends the
    // client a misleading "moved to stage X" when only a link was added
    const stageChanged = !before || before.stage !== project.stage;
    const milestoneChanged = !!before && (before.nextMilestoneLabel || '') !== (project.nextMilestoneLabel || '');
    const stagingAdded = !!project.stagingUrl && project.stagingUrl !== (before?.stagingUrl || '');
    const noteChanged = noteWillChange && !!project.statusNote;

    if (stageChanged || milestoneChanged) {
      const msg = `Your project is now in the "${project.stage}" stage.${project.nextMilestoneLabel ? ` Next: ${project.nextMilestoneLabel}.` : ''}`;
      await notifyUser(client._id, { title: 'Project updated', message: msg, type: 'milestone' });
      await logActivity(client._id, 'milestone', msg);
    }
    if (stagingAdded) {
      await notifyUser(client._id, {
        title: 'Preview link ready',
        message: 'A staging link for your website is now available on your project page.',
        type: 'milestone',
      });
      await logActivity(client._id, 'milestone', 'A staging preview link was added to your project.');
    }
    if (noteChanged) {
      await logActivity(client._id, 'milestone', `Status update: ${project.statusNote}`);
    }

    const KEYS = ['name', 'planLabel', 'stage', 'nextMilestoneLabel', 'stagingUrl', 'statusNote', 'totalCost'];
    await logAudit(req, 'project.save', {
      entityType: 'project', entityId: project._id, entityLabel: `${clientLabel(client)} — ${project.name}`,
      summary: before ? `Project updated: ${clientLabel(client)}` : `Project created: ${clientLabel(client)}`,
      meta: { changed: diffObjects(before ? before.toObject() : {}, project.toObject(), KEYS) },
    });

    res.json({ message: 'Project saved', project });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not save project', error: err.message });
  }
};

// e.g. INV-2026-0007 — sequential per year
const nextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const last = await Invoice.findOne({ invoiceNumber: { $regex: `^INV-${year}-` } })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber');
  return computeNextNumber(last?.invoiceNumber, year);
};

const isHttpUrl = (value) => /^https?:\/\//i.test(value);
const formatINR = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

// POST /api/owner/clients/:id/invoices
export const createInvoice = async (req, res) => {
  try {
    const { description, dueDate, paymentLink } = req.body;
    const amount = Math.round(Number(req.body.amount) * 100) / 100;

    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be a number greater than 0' });
    }
    // only http(s) links: this becomes a clickable "Pay now" button for the client
    if (paymentLink && !isHttpUrl(paymentLink)) {
      return res.status(400).json({ message: 'Payment link must start with http:// or https://' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Client not found' });
    }

    const client = await User.findOne({ _id: req.params.id, role: 'client' });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    let invoice;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        invoice = await Invoice.create({
          client: client._id,
          description: description.trim(),
          amount,
          dueDate: dueDate || undefined,
          paymentLink: paymentLink || undefined,
          invoiceNumber: await nextInvoiceNumber(),
        });
        break;
      } catch (err) {
        // two invoices created at the same instant can pick the same number and
        // the unique index rejects the second — just take the next number
        if (err.code === 11000 && attempt < 2) continue;
        throw err;
      }
    }

    const dueText = dueDate ? ` due by ${new Date(dueDate).toLocaleDateString('en-IN')}` : '';
    await notifyUser(client._id, {
      title: 'New invoice',
      message: `${invoice.invoiceNumber}: ${invoice.description} — ${formatINR(amount)}${dueText}.`,
      type: 'invoice',
    });
    await logActivity(client._id, 'invoice', `New invoice ${invoice.invoiceNumber}: ${invoice.description} — ${formatINR(amount)}.`);

    await logAudit(req, 'invoice.create', { entityType: 'invoice', entityId: invoice._id, entityLabel: invoice.invoiceNumber, summary: `Invoice ${invoice.invoiceNumber} created for ${clientLabel(client)} — ${formatINR(amount)}`, meta: { amount, dueDate: dueDate || undefined } });

    res.status(201).json({ message: 'Invoice created', invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not create invoice', error: err.message });
  }
};

// PATCH /api/owner/invoices/:invoiceId — mark paid/due and/or set the payment link
export const updateInvoice = async (req, res) => {
  try {
    const { status, paymentLink, paymentMode, transactionId } = req.body;

    if (paymentMode !== undefined && paymentMode !== '' && !PAYMENT_MODES.includes(paymentMode)) {
      return res.status(400).json({ message: `Payment mode must be one of: ${PAYMENT_MODES.join(', ')}` });
    }
    if (transactionId !== undefined && String(transactionId).trim().length > 60) {
      return res.status(400).json({ message: 'Reference ID must be 60 characters or fewer' });
    }
    if (status !== undefined && !['due', 'paid'].includes(status)) {
      return res.status(400).json({ message: 'Status must be "due" or "paid"' });
    }
    if (paymentLink && !isHttpUrl(paymentLink)) {
      return res.status(400).json({ message: 'Payment link must start with http:// or https://' });
    }
    if (!mongoose.isValidObjectId(req.params.invoiceId)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const wasPaid = invoice.status === 'paid';
    const before = invoice.toObject();
    if (status !== undefined) {
      invoice.status = status;
      invoice.paidAt = status === 'paid' ? (wasPaid ? invoice.paidAt : new Date()) : undefined;
      if (status === 'due') { invoice.paymentMode = undefined; invoice.transactionId = undefined; } // no stale receipt details
    }
    if (paymentLink !== undefined) invoice.paymentLink = paymentLink || undefined;
    // payment details only make sense on a paid invoice (they are printed on its receipt)
    if (invoice.status === 'paid') {
      if (paymentMode !== undefined) invoice.paymentMode = paymentMode || undefined;
      if (transactionId !== undefined) invoice.transactionId = String(transactionId).trim() || undefined;
    }
    await invoice.save();

    // keep the receipt records in step with the invoice (a failure here must never block the invoice update itself)
    try {
      if (status === 'paid' && !wasPaid) await receiptForInvoice(invoice, req.user);
      else if (status === 'due' && wasPaid) {
        const live = await Receipt.find({ invoice: invoice._id, voided: false });
        for (const r of live) await voidReceipt(r._id, req.user, 'Invoice was marked unpaid', { revertInvoiceStatus: false });
      } else if (invoice.status === 'paid' && (paymentMode !== undefined || transactionId !== undefined)) await syncInvoiceDetails(invoice);
    } catch (e) {
      console.error('[receipt] could not sync receipt for invoice', invoice._id, e.message);
    }

    const changed = diffObjects(before, invoice.toObject(), ['status', 'paymentLink', 'paymentMode', 'transactionId']);
    if (status === 'paid' && !wasPaid) {
      await logAudit(req, 'invoice.mark_paid', { entityType: 'invoice', entityId: invoice._id, entityLabel: invoiceLabel(invoice), summary: `Invoice ${invoiceLabel(invoice)} marked paid — ${formatINR(invoice.amount)}`, meta: { amount: invoice.amount, paymentMode: invoice.paymentMode, reference: invoice.transactionId } });
    } else if (changed.length) {
      await logAudit(req, 'invoice.update', { entityType: 'invoice', entityId: invoice._id, entityLabel: invoiceLabel(invoice), meta: { changed } });
    }

    // tell the client when a payment is recorded (not when it's flipped back to due)
    if (status === 'paid' && !wasPaid) {
      await notifyUser(invoice.client, {
        title: 'Payment received',
        message: `Thank you — ${invoice.description} (${formatINR(invoice.amount)}) is marked as paid.`,
        type: 'invoice',
      });
      await logActivity(invoice.client, 'invoice', `Payment received for "${invoice.description}" — ${formatINR(invoice.amount)}.`);
    }

    res.json({ message: 'Invoice updated', invoice });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update invoice', error: err.message });
  }
};

// GET /api/owner/invoices/:invoiceId/pdf
export const downloadInvoicePdfOwner = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.invoiceId)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const client = await User.findById(invoice.client).select('fullName businessName email phone clientId');
    await sendInvoicePdf(res, invoice, client || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not generate the PDF', error: err.message });
  }
};

// GET /api/owner/invoices/:invoiceId/receipt — payment receipt for a PAID invoice
export const downloadReceiptOwner = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.invoiceId)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const invoice = await Invoice.findById(req.params.invoiceId);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    await sendInvoiceReceipt(req, res, invoice);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Could not generate the receipt', error: err.message });
  }
};

// GET /api/owner/tickets — every ticket across every client, newest activity first
export const listAllTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find()
      .populate('client', 'businessName fullName clientId email')
      .sort({ updatedAt: -1 });
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load tickets', error: err.message });
  }
};

// POST /api/owner/tickets/:id/reply
export const replyToTicketOwner = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'A message is required' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    ticket.replies.push({ author: 'owner', message: message.trim() });
    ticket.lastReplyBy = 'owner';
    // a reply on a closed ticket reopens it — silence after "closed" would be confusing
    ticket.status = 'open';
    await ticket.save();

    await notifyUser(ticket.client, {
      title: 'Reply to your support ticket',
      message: `Codexora replied on "${ticket.subject}".`,
      type: 'ticket',
    });
    await logActivity(ticket.client, 'ticket', `Codexora replied on your ticket "${ticket.subject}".`);

    const populated = await ticket.populate('client', 'businessName fullName clientId email');
    await logAudit(req, 'ticket.reply', { entityType: 'ticket', entityId: ticket._id, entityLabel: ticket.subject, summary: `Replied to ticket "${ticket.subject}" (${clientLabel(populated.client)})` });
    res.status(201).json({ message: 'Reply sent', ticket: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not send reply', error: err.message });
  }
};

// PATCH /api/owner/tickets/:id — open/closed
export const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['open', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Status must be "open" or "closed"' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const wasClosed = ticket.status === 'closed';
    ticket.status = status;
    await ticket.save();

    if (status === 'closed' && !wasClosed) {
      await notifyUser(ticket.client, {
        title: 'Support ticket resolved',
        message: `"${ticket.subject}" has been marked resolved.`,
        type: 'ticket',
      });
      await logActivity(ticket.client, 'ticket', `Your ticket "${ticket.subject}" was marked resolved.`);
    }

    const populated = await ticket.populate('client', 'businessName fullName clientId email');
    if (wasClosed !== (status === 'closed')) {
      await logAudit(req, 'ticket.status', { entityType: 'ticket', entityId: ticket._id, entityLabel: ticket.subject, summary: `Ticket "${ticket.subject}" ${status === 'closed' ? 'closed' : 'reopened'} (${clientLabel(populated.client)})`, meta: { status } });
    }
    res.json({ message: 'Ticket updated', ticket: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update ticket', error: err.message });
  }
};

// GET /api/owner/activity — recent activity across EVERY client, for the
// Overview tab (the client-side /client/activity endpoint is scoped to one
// client; this one isn't)
export const listAllActivity = async (req, res) => {
  try {
    const activity = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(12)
      .populate('client', 'businessName fullName');
    res.json({ activity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load activity', error: err.message });
  }
};
