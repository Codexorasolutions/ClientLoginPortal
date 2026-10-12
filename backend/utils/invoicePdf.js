import PDFDocument from 'pdfkit';
import { invoiceLabel } from './invoiceNumber.js';
import { getSettings } from './settings.js';

const C = {
  ink: '#14161C',
  soft: '#6B7280',
  line: '#E4E7DA',
  paper: '#F3F6EE',
  teal: '#14B8A6',
  tealDark: '#0E9488',
  rust: '#E2793B',
};

// PDF's built-in fonts can't draw the rupee sign or non-Latin scripts (e.g.
// Devanagari), so amounts are written as "Rs." and unsupported characters are
// dropped instead of coming out as garbage. Common punctuation those fonts
// DO support (em dash, curly quotes, bullets...) is kept.
export const latin = (text = '') =>
  String(text)
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E\xA0-\xFF\n\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();

export const money = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// Owner-editable Settings win; the COMPANY_* env vars remain the fallback.
// Read at call time (not import time) so .env is guaranteed to be loaded.
const company = (settings) => ({
  name: latin(settings?.business?.name || process.env.COMPANY_NAME) || 'Codexora Solutions',
  address: latin(settings?.business?.address ?? process.env.COMPANY_ADDRESS),
  email: latin(settings?.business?.email ?? process.env.COMPANY_EMAIL),
});

const invoiceState = (invoice) => {
  if (invoice.status === 'paid') return 'PAID';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return invoice.dueDate && new Date(invoice.dueDate) < startOfToday ? 'OVERDUE' : 'DUE';
};

// Builds the invoice PDF and resolves with a Buffer (invoices are one page,
// so buffering is simpler and safer than streaming into the response).
export const renderInvoicePdf = ({ invoice, client = {}, settings = null }) =>
  new Promise((resolve, reject) => {
    const label = invoiceLabel(invoice);
    const co = company(settings);
    const state = invoiceState(invoice);

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${label}`, Author: co.name },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // ---- top accent + header ----
    doc.rect(0, 0, doc.page.width, 8).fill(C.teal);

    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(20).text(co.name, left, 44, { width: 260 });
    doc.font('Helvetica').fontSize(9).fillColor(C.soft);
    if (co.address) doc.text(co.address, left, doc.y + 3, { width: 260 });
    if (co.email) doc.text(co.email, left, doc.y + 2, { width: 260 });

    doc.font('Helvetica-Bold').fontSize(26).fillColor(C.teal).text('INVOICE', left, 44, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(C.soft).text(label, left, 76, { width, align: 'right' });

    // status badge
    const badgeW = 70;
    const badgeColor = state === 'PAID' ? C.tealDark : C.rust;
    doc.roundedRect(right - badgeW, 96, badgeW, 20, 10).fill(badgeColor);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF').text(state, right - badgeW, 102, { width: badgeW, align: 'center' });

    // ---- bill to / dates ----
    const infoY = 150;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(C.soft).text('BILL TO', left, infoY);

    const businessName = latin(client.businessName);
    const contactName = latin(client.fullName);
    const billName = businessName || contactName || 'Client';

    doc.font('Helvetica-Bold').fontSize(12).fillColor(C.ink).text(billName, left, infoY + 14, { width: 250 });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.soft);
    if (businessName && contactName) doc.text(contactName, left, doc.y + 2, { width: 250 });
    if (client.email) doc.text(latin(client.email), left, doc.y + 2, { width: 250 });
    if (client.phone) doc.text(latin(client.phone), left, doc.y + 2, { width: 250 });
    if (client.clientId) doc.text(`Client ID: ${latin(client.clientId)}`, left, doc.y + 2, { width: 250 });
    // remember where the Bill-To block ends: the date column below moves doc.y,
    // and the table must start under whichever column is taller
    const billBottom = doc.y;

    const dateRows = [['Issued', fmtDate(invoice.createdAt)]];
    if (invoice.dueDate) dateRows.push(['Due', fmtDate(invoice.dueDate)]);
    if (invoice.status === 'paid' && invoice.paidAt) dateRows.push(['Paid on', fmtDate(invoice.paidAt)]);

    let dy = infoY;
    dateRows.forEach(([k, v]) => {
      doc.font('Helvetica').fontSize(9.5).fillColor(C.soft).text(k, 340, dy, { width: 70 });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.ink).text(v, 410, dy, { width: right - 410, align: 'right' });
      dy += 18;
    });

    // ---- line item table ----
    let y = Math.max(billBottom, dy) + 40;
    doc.rect(left, y, width, 26).fill(C.paper);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.soft);
    doc.text('DESCRIPTION', left + 12, y + 9);
    doc.text('AMOUNT', left, y + 9, { width: width - 12, align: 'right' });
    y += 26;

    let description = latin(invoice.description) || '-';
    if (description.length > 1200) description = `${description.slice(0, 1200)}…`;
    const descWidth = width - 150;
    doc.font('Helvetica').fontSize(11).fillColor(C.ink);
    const descHeight = doc.heightOfString(description, { width: descWidth });
    doc.text(description, left + 12, y + 14, { width: descWidth });
    doc.font('Helvetica-Bold').text(money(invoice.amount), left, y + 14, { width: width - 12, align: 'right' });

    y += 14 + Math.max(descHeight, 14) + 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.7).strokeColor(C.line).stroke();

    // ---- totals ----
    y += 16;
    const totalsX = 330;
    const row = (k, v, opts = {}) => {
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).fillColor(opts.color || C.soft);
      doc.text(k, totalsX, y, { width: 100 });
      doc.font('Helvetica-Bold').fillColor(opts.valueColor || C.ink).text(v, totalsX + 100, y, { width: right - totalsX - 100, align: 'right' });
      y += opts.gap || 20;
    };

    row('Total', money(invoice.amount));
    if (invoice.status === 'paid') row('Paid', `- ${money(invoice.amount)}`, { valueColor: C.tealDark });

    doc.moveTo(totalsX, y).lineTo(right, y).lineWidth(0.7).strokeColor(C.line).stroke();
    y += 10;
    row('Amount due', money(invoice.status === 'paid' ? 0 : invoice.amount), {
      bold: true, size: 12, color: C.ink, valueColor: invoice.status === 'paid' ? C.tealDark : C.rust, gap: 28,
    });

    // ---- payment link (only while something is owed) ----
    if (invoice.status !== 'paid' && invoice.paymentLink) {
      y += 6;
      doc.roundedRect(left, y, width, 50, 8).lineWidth(0.8).strokeColor(C.line).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.soft).text('PAY ONLINE', left + 14, y + 11);
      doc.font('Helvetica').fontSize(10).fillColor(C.tealDark).text(invoice.paymentLink, left + 14, y + 26, {
        width: width - 28, link: invoice.paymentLink, underline: true, lineBreak: false, ellipsis: true,
      });
    }

    // ---- footer ----
    const footerY = doc.page.height - 78;
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(0.7).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(9).fillColor(C.soft).text('Thank you for your business.', left, footerY + 10, { width, lineBreak: false });
    doc.text(`Generated ${fmtDate(new Date())}`, left, footerY + 10, { width, align: 'right', lineBreak: false });

    doc.end();
  });

export const sendInvoicePdf = async (res, invoice, client) => {
  const settings = await getSettings().catch(() => null);
  const pdf = await renderInvoicePdf({ invoice, client, settings });
  const filename = `${invoiceLabel(invoice)}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': pdf.length,
    'Cache-Control': 'private, no-store', // invoices are personal — don't let proxies/browsers keep shared copies
  });
  res.send(pdf);
};
