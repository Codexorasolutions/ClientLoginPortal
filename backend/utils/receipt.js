// Receipt = database side: gathers the numbers for one PAID invoice and sends the PDF.
import Invoice from '../models/Invoice.js';
import Project from '../models/Project.js';
import { getSettings } from './settings.js';
import { invoiceLabel } from './invoiceNumber.js';
import { renderReceiptPdf } from './receiptPdf.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// INV-2026-0007 -> RCT-2026-0007 (older invoices: INV-A1B2C3 -> RCT-A1B2C3). Always the same for the same invoice.
export const receiptNumber = (invoice) => `RCT-${invoiceLabel(invoice).replace(/^INV-/, '')}`;

export async function buildReceiptData(invoice, client = {}) {
  const [project, all] = await Promise.all([
    Project.findOne({ client: invoice.client }).select('name planLabel'),
    Invoice.find({ client: invoice.client }).select('amount status paidAt'),
  ]);
  const paidAt = invoice.paidAt || invoice.updatedAt || new Date();

  // Totals are "as of this payment": everything the client has been billed, and everything paid up to and including this invoice.
  const total = round2(all.reduce((sum, i) => sum + i.amount, 0));
  const earlier = all.filter((i) => String(i._id) !== String(invoice._id) && i.status === 'paid' && i.paidAt && new Date(i.paidAt) <= new Date(paidAt));
  const received = round2(earlier.reduce((sum, i) => sum + i.amount, 0) + invoice.amount);
  const settings = await getSettings();

  return {
    receiptNo: receiptNumber(invoice),
    date: paidAt,
    gstin: settings.business.gstin || settings.business.pan || '',
    clientName: client.fullName || '',
    business: client.businessName || '',
    phone: client.phone || '',
    email: client.email || '',
    paymentMode: invoice.paymentMode || '',
    reference: invoice.transactionId || '',
    paymentDate: paidAt,
    projectPlan: project?.planLabel || project?.name || '',
    items: [{ description: invoice.description, amount: invoice.amount }],
    total: Math.max(total, received),
    received,
    receivedLabel: received === invoice.amount ? 'Amount received' : 'Received to date',
    balance: Math.max(0, round2(total - received)),
    notes: settings.receipt.notes || '',
    settings,
  };
}

// Sends the receipt PDF, or answers 400 if the invoice isn't paid yet. Returns the receipt number when sent.
export async function sendReceiptPdf(res, invoice, client) {
  if (invoice.status !== 'paid') {
    res.status(400).json({ message: 'A receipt is only available once the invoice is marked paid.' });
    return null;
  }
  const data = await buildReceiptData(invoice, client);
  const pdf = await renderReceiptPdf(data, data.settings);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${data.receiptNo.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'private, no-store',
  });
  res.send(pdf);
  return data.receiptNo;
}
