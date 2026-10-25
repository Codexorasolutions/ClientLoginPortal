// "₹8,000" or "₹12,500.50" — Indian digit grouping, decimals only when needed
export const formatINR = (n) => {
  const num = Number(n || 0);
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

// Older invoices have no invoiceNumber, so fall back to a short id-based one.
// (Same rule the backend uses for the PDF, so the two always match.)
export const invoiceLabel = (inv) => inv.invoiceNumber || `INV-${String(inv._id).slice(-6).toUpperCase()}`;

// only http(s) links become clickable — never render javascript: and friends
export const isHttpUrl = (value) => /^https?:\/\//i.test(value || '');

export const isOverdue = (inv) => {
  if (inv.status !== 'due' || !inv.dueDate) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return new Date(inv.dueDate) < startOfToday;
};

// "Shanti Public School" -> "SP", "R. Verma" -> "RV", "अमित" -> "अम" — works
// for any script, not just Latin, since many client names here are in
// Hindi. Falls back to "?" only for genuinely empty/whitespace input.
// Works per visible character (grapheme), not per code unit, so Hindi names like "क्षमा" or "श्रेया"
// and emoji are never cut in half. Falls back to code points where Intl.Segmenter is unavailable.
const graphemes = (s) =>
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment)
    : Array.from(s);

export const initials = (name = '') => {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return graphemes(words[0]).slice(0, 2).join('').toUpperCase();
  return (graphemes(words[0])[0] + graphemes(words[1])[0]).toUpperCase();
};

// running totals for a list of invoices
export const invoiceTotals = (invoices = []) => {
  const invoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const paid = invoices.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0);
  return { invoiced, paid, due: invoiced - paid };
};
