import Project from '../models/Project.js';
import Deliverable from '../models/Deliverable.js';
import { withThumbnail } from '../utils/thumbnail.js';
import { sendInvoicePdf } from '../utils/invoicePdf.js';
import { sendInvoiceReceipt } from './receiptController.js';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import SupportTicket from '../models/SupportTicket.js';
import { notifyOwners } from '../utils/notify.js';
import { logActivity } from '../utils/activity.js';
import Activity from '../models/Activity.js';

// GET /api/client/dashboard — everything the client dashboard needs in one call
export const getDashboard = async (req, res) => {
  try {
    const clientId = req.user._id;

    const project = await Project.findOne({ client: clientId }).sort({ createdAt: -1 });
    const deliverables = await Deliverable.find({ client: clientId }).sort({ createdAt: -1 }).limit(100);
    const invoices = await Invoice.find({ client: clientId }).sort({ createdAt: -1 });
    const openTicketsCount = await SupportTicket.countDocuments({ client: clientId, status: 'open' });

    const balanceDue = invoices
      .filter((inv) => inv.status === 'due')
      .reduce((sum, inv) => sum + inv.amount, 0);

    res.json({
      client: {
        fullName: req.user.fullName,
        businessName: req.user.businessName,
        clientId: req.user.clientId,
      },
      project,
      deliverables: deliverables.map(withThumbnail),
      invoices,
      balanceDue,
      openTicketsCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load dashboard', error: err.message });
  }
};

// POST /api/client/tickets/:id/reply — a client can only reply on their own ticket
export const replyToTicketClient = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'A message is required' });
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const ticket = await SupportTicket.findOne({ _id: req.params.id, client: req.user._id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (ticket.status === 'closed') {
      return res.status(400).json({ message: 'This ticket is closed. Raise a new ticket if you need further help.' });
    }

    ticket.replies.push({ author: 'client', message: message.trim() });
    ticket.lastReplyBy = 'client';
    await ticket.save();

    await notifyOwners({
      title: 'New reply on a support ticket',
      message: `${req.user.businessName || req.user.fullName}: "${ticket.subject}"`,
      type: 'ticket',
    });
    await logActivity(req.user._id, 'ticket', `You replied on "${ticket.subject}".`);

    res.status(201).json({ message: 'Reply sent', ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not send reply', error: err.message });
  }
};

export const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required' });
    }

    const ticket = await SupportTicket.create({
      client: req.user._id,
      subject,
      message,
    });

    await notifyOwners({
      title: 'New support ticket',
      message: `${req.user.businessName || req.user.fullName}: "${subject}"`,
      type: 'ticket',
    });
    await logActivity(req.user._id, 'ticket', `You raised a support ticket: "${subject}".`);

    res.status(201).json({ message: 'Support ticket submitted', ticket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not submit ticket', error: err.message });
  }
};

// GET /api/client/tickets
export const listTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ client: req.user._id }).sort({ createdAt: -1 });
    res.json({ tickets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load tickets', error: err.message });
  }
};

// GET /api/client/activity — recent activity feed for the Overview page
export const getActivity = async (req, res) => {
  try {
    const activity = await Activity.find({ client: req.user._id })
      .sort({ createdAt: -1 })
      .limit(15);
    res.json({ activity });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load activity', error: err.message });
  }
};

// GET /api/client/invoices/:id/receipt — a client can only download receipts for their own PAID invoices
export const downloadReceiptClient = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    const invoice = await Invoice.findOne({ _id: req.params.id, client: req.user._id });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    await sendInvoiceReceipt(req, res, invoice);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Could not generate the receipt', error: err.message });
  }
};

// GET /api/client/invoices/:id/pdf — a client can only download their own invoices
export const downloadInvoicePdf = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    // scoped to the logged-in client: someone else's invoice id just looks like "not found"
    const invoice = await Invoice.findOne({ _id: req.params.id, client: req.user._id });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    await sendInvoicePdf(res, invoice, req.user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not generate the PDF', error: err.message });
  }
};
