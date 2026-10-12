// Pure helpers (no database) so they're easy to test.

// Given the highest existing number for this year (or nothing), return the next one.
export const computeNextNumber = (lastNumber, year) => {
  let seq = 1;
  if (lastNumber) {
    const n = parseInt(String(lastNumber).split('-')[2], 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
};

// What to call an invoice on screen and in the PDF. Invoices created before
// numbering existed have no invoiceNumber, so fall back to a short id-based one.
export const invoiceLabel = (invoice) =>
  invoice.invoiceNumber || `INV-${String(invoice._id).slice(-6).toUpperCase()}`;
