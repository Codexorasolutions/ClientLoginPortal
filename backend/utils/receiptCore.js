// Pure receipt logic (no database): money maths, validation, numbering, amount in words, verification IDs.
import crypto from 'crypto';

export const PAYMENT_MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'];
export const MAX_ITEMS = 10;
const MAX_AMOUNT = 100_000_000; // ₹10 crore — a typo guard, not a business rule

// ---------- money (integer paise, so ₹0.10 + ₹0.20 is exactly ₹0.30) ----------
export const toPaise = (n) => Math.round(Number(n) * 100);
export const fromPaise = (p) => p / 100;
export const isMoney = (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export const inr = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 });
};

// ---------- amount in words (Indian lakh/crore system) ----------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const below1000 = (n) => `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${below100(n % 100)}`;

export function amountInWords(amount) {
  const total = toPaise(amount);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lakh = Math.floor(rupees / 100000); rupees %= 100000;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rupees) parts.push(below1000(rupees));
  let words = parts.length ? `Rupees ${parts.join(' ')}` : 'Rupees Zero';
  if (paise) words += ` and ${below100(paise)} Paise`;
  return `${words} Only`;
}

// ---------- totals & status ----------
// totalCost / receivedBefore / amount are rupees. Returns { ok:true, receivedToDate, balanceDue, status } or { ok:false, message }.
export function computeTotals({ totalCost, receivedBefore, amount, allowOverpayment = false }) {
  const total = toPaise(totalCost), before = toPaise(receivedBefore), pay = toPaise(amount);
  if (!(pay > 0)) return { ok: false, message: 'The amount received must be more than ₹0.' };
  if (!(total > 0)) return { ok: false, message: 'Enter the total project cost first.' };
  const balance = total - (before + pay);
  if (balance < 0 && !allowOverpayment) {
    return {
      ok: false, code: 'exceeds_balance',
      message: `This receipt (₹${inr(amount)}) is more than the balance due (₹${inr(fromPaise(total - before))}). Lower the amount, correct the total project cost, or tick "Allow overpayment (credit)".`,
    };
  }
  return { ok: true, receivedToDate: fromPaise(before + pay), balanceDue: fromPaise(balance), status: balance <= 0 ? 'paid_in_full' : 'part_payment' };
}

export const STATUS_LABELS = { paid_in_full: 'Paid in full', part_payment: 'Part payment', unpaid: 'Unpaid', cancelled: 'Cancelled' };

// ---------- numbering ----------
// RCT-2026-0007. `lastNumber` is the highest existing number for that year (or nothing).
export const computeNextReceiptNumber = (lastNumber, year) => {
  let seq = 1;
  if (lastNumber) {
    const n = parseInt(String(lastNumber).split('-')[2], 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `RCT-${year}-${String(seq).padStart(4, '0')}`;
};

// ---------- verification ID ----------
// Generated on the server only. HMAC over the receipt's identity, keyed with a server secret, so it cannot be forged
// without the key. Recomputing it (or searching it in Receipt history) confirms a receipt is genuine.
export function verificationId({ receiptNumber, amount, paymentDate, clientId }) {
  const secret = process.env.RECEIPT_SECRET || process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('RECEIPT_SECRET (or JWT_SECRET) must be set');
  const day = new Date(paymentDate).toISOString().slice(0, 10);
  const payload = [receiptNumber, Number(amount).toFixed(2), day, String(clientId)].join('|');
  const hex = crypto.createHmac('sha256', `receipt-verification:${secret}`).update(payload).digest('hex').toUpperCase().slice(0, 12);
  return hex.match(/.{4}/g).join('-');
}

// ---------- dates ----------
const istDay = (d) => new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD in IST
export const todayIST = (now = new Date()) => istDay(now);

// ---------- input validation ----------
const str = (v, max, label, errors, key, { required = false } = {}) => {
  const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
  if (required && !s) errors[key] = `${label} is required`;
  else if (s.length > max) errors[key] = `${label} must be ${max} characters or fewer`;
  return s;
};

// body → { value, errors }.  `value` only contains cleaned, typed fields.
export function validateReceiptInput(body = {}, now = new Date()) {
  const errors = {};
  const v = {};

  v.clientName = str(body.clientName, 80, 'Client name', errors, 'clientName', { required: true });
  v.clientBusiness = str(body.clientBusiness, 100, 'Business / institution', errors, 'clientBusiness');
  v.clientPhone = str(body.clientPhone, 30, 'Phone', errors, 'clientPhone');
  v.clientEmail = str(body.clientEmail, 120, 'Email', errors, 'clientEmail');
  if (v.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.clientEmail)) errors.clientEmail = 'Enter a valid email address';

  v.paymentMode = body.paymentMode;
  if (!PAYMENT_MODES.includes(v.paymentMode)) errors.paymentMode = `Choose a payment mode (${PAYMENT_MODES.join(', ')})`;
  v.transactionId = str(body.transactionId, 60, 'Transaction / reference ID', errors, 'transactionId');
  v.projectPlan = str(body.projectPlan, 80, 'Project / plan', errors, 'projectPlan');
  v.notes = String(body.notes ?? '').replace(/\r\n/g, '\n').trim();
  if (v.notes.length > 300) errors.notes = 'Notes must be 300 characters or fewer';

  // payment date: YYYY-MM-DD, real calendar date, not in the future (IST), not absurdly old
  const ds = String(body.paymentDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || isNaN(new Date(`${ds}T00:00:00.000Z`)) || new Date(`${ds}T00:00:00.000Z`).toISOString().slice(0, 10) !== ds) {
    errors.paymentDate = 'Enter a valid payment date';
  } else if (ds > todayIST(now)) errors.paymentDate = 'Payment date cannot be in the future';
  else if (ds < '2020-01-01') errors.paymentDate = 'Payment date looks too old — check the year';
  else v.paymentDate = new Date(`${ds}T00:00:00.000Z`);

  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length < 1) errors.items = 'Add at least one description row';
  else if (rawItems.length > MAX_ITEMS) errors.items = `A receipt can have at most ${MAX_ITEMS} rows`;
  v.items = [];
  rawItems.slice(0, MAX_ITEMS).forEach((it, i) => {
    const description = str(it?.description, 120, 'Description', errors, `items.${i}.description`, { required: true });
    const amount = typeof it?.amount === 'string' && it.amount.trim() !== '' ? Number(it.amount) : it?.amount;
    if (!isMoney(amount) || amount <= 0) errors[`items.${i}.amount`] = 'Enter an amount above ₹0 (up to 2 decimals)';
    else if (amount > MAX_AMOUNT) errors[`items.${i}.amount`] = 'Amount is too large';
    v.items.push({ description, amount });
  });
  if (!errors.items && !Object.keys(errors).some((k) => k.startsWith('items.'))) {
    v.amountReceived = fromPaise(v.items.reduce((s, it) => s + toPaise(it.amount), 0));
  }

  if (body.totalProjectCost !== undefined && body.totalProjectCost !== null && body.totalProjectCost !== '') {
    const t = Number(body.totalProjectCost);
    if (!isMoney(t) || t <= 0 || t > MAX_AMOUNT * 10) errors.totalProjectCost = 'Enter the total project cost in ₹ (more than 0, up to 2 decimals)';
    else v.totalProjectCost = t;
  }

  v.allowOverpayment = body.allowOverpayment === true;
  v.confirmDuplicate = body.confirmDuplicate === true;
  v.invoiceId = body.invoiceId ? String(body.invoiceId) : '';
  v.clientId = String(body.clientId || '');
  v.idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey) : '';
  if (v.idempotencyKey && !/^[A-Za-z0-9_-]{8,64}$/.test(v.idempotencyKey)) errors.idempotencyKey = 'Invalid request key';

  return { value: v, errors };
}

// "UPI4093817265" and " upi4093817265 " are the same transaction
export const normaliseRef = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
