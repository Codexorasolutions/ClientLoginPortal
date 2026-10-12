import { formatINR, invoiceLabel } from './format.js';

// Escapes a value for a CSV cell: wraps in quotes and doubles any inner
// quote whenever the value contains a comma, quote, or newline — the
// standard CSV-escaping rule (RFC 4180).
const csvCell = (value) => {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export function invoicesToCsv(invoices = []) {
  const header = ['Invoice', 'Description', 'Issued', 'Due', 'Amount', 'Status', 'Paid on', 'Payment link'];
  const rows = invoices.map((inv) => [
    invoiceLabel(inv),
    inv.description,
    new Date(inv.createdAt).toLocaleDateString('en-IN'),
    inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '',
    formatINR(inv.amount),
    inv.status,
    inv.status === 'paid' && inv.paidAt ? new Date(inv.paidAt).toLocaleDateString('en-IN') : '',
    inv.paymentLink || '',
  ]);
  // \uFEFF: a UTF-8 BOM so Excel renders ₹ correctly instead of showing "â‚¹"
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadInvoicesCsv(invoices, filename = 'invoices.csv') {
  const csv = invoicesToCsv(invoices);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
