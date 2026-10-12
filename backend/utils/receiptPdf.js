// Payment receipt PDF (A4) — pure drawing, no database. Layout follows Codexora_Payment_Receipt.pdf.
// Fonts: Carlito (draws the ₹ sign) + Noto Sans Devanagari for Hindi names, both bundled in backend/assets/fonts.
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FONT = (f) => path.join(ASSETS, 'fonts', f);
const LOGO = path.join(ASSETS, 'codexora-logo.png');

const BRAND = '#554CF9';
const INK = '#1B1B2F';
const MUTED = '#7A7F99';
const LINE = '#D5D8EE';
const TINT = '#F3F3FD';
const GREEN = '#15803D';

// ---------- helpers ----------
export const inr = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 });
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`);
const below1000 = (n) => `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${below100(n % 100)}`;

// Indian system: lakh / crore
export function amountInWords(amount) {
  const total = Math.round(Number(amount || 0) * 100);
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

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

// ---------- digital verification ----------
// A code only this server can produce. Recompute it later to check a receipt is genuine.
export function verificationCode({ receiptNo, amount, paymentDate, clientName }) {
  const secret = process.env.RECEIPT_SECRET || process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('RECEIPT_SECRET (or JWT_SECRET) must be set');
  const day = new Date(paymentDate).toISOString().slice(0, 10);
  const payload = [receiptNo, Number(amount).toFixed(2), day, clientName || ''].join('|');
  const hex = crypto.createHmac('sha256', `receipt:${secret}`).update(payload).digest('hex').toUpperCase().slice(0, 12);
  return hex.match(/.{4}/g).join('-'); // e.g. 9F3A-C21B-77D0
}

// ---------- drawing ----------
// data: { receiptNo, date, gstin, clientName, business, phone, email, paymentMode, reference, paymentDate,
//         projectPlan, items:[{description, amount}], total, received, receivedLabel, balance, notes }
function draw(doc, d, s) {
  const L = 40, R = 554;
  const biz = s.business;
  doc.registerFont('R', FONT('Carlito-Regular.ttf'));
  doc.registerFont('B', FONT('Carlito-Bold.ttf'));
  const hasDev = fs.existsSync(FONT('NotoSansDevanagari-Regular.ttf'));
  if (hasDev) {
    doc.registerFont('DR', FONT('NotoSansDevanagari-Regular.ttf'));
    doc.registerFont('DB', FONT('NotoSansDevanagari-Bold.ttf'));
  }
  // Mixed text ("आरडी स्कूल (RD School)") is split into runs: Devanagari runs use the Hindi font, the rest Carlito.
  const isDev = (ch) => /[\u0900-\u097F\u200C\u200D]/.test(ch);
  const runs = (text) => {
    const out = [];
    let cur = '', curDev = null;
    for (const ch of String(text)) {
      const dv = /\s/.test(ch) ? (curDev ?? false) : isDev(ch);   // spaces stay with the run they follow
      if (curDev !== null && dv !== curDev && cur) { out.push({ t: cur, dev: curDev }); cur = ''; }
      curDev = dv; cur += ch;
    }
    if (cur) out.push({ t: cur, dev: curDev });
    return out;
  };
  const fontOf = (dev, bold) => (hasDev && dev ? (bold ? 'DB' : 'DR') : (bold ? 'B' : 'R'));
  const widthOf = (text, bold) => runs(text).reduce((w, r) => { doc.font(fontOf(r.dev, bold)); return w + doc.widthOfString(r.t); }, 0);
  // single line; honours width / align / ellipsis (set fontSize + fillColor before calling)
  const txt = (text, x, y, opts = {}, bold = false) => {
    let str = String(text ?? '');
    if (!str) return;
    let w = widthOf(str, bold);
    if (opts.width && opts.ellipsis && w > opts.width) {
      while (str.length > 1 && widthOf(`${str}…`, bold) > opts.width) str = str.slice(0, -1);
      str += '…'; w = widthOf(str, bold);
    }
    let cx = x;
    if (opts.align === 'right') cx = x + opts.width - w;
    else if (opts.align === 'center') cx = x + (opts.width - w) / 2;
    for (const r of runs(str)) { doc.font(fontOf(r.dev, bold)); doc.text(r.t, cx, y, { lineBreak: false }); cx += doc.widthOfString(r.t); }
  };
  // wrapped paragraph, at most maxLines lines
  const para = (text, x, y, width, maxLines, lh) => {
    const lines = [];
    for (const raw of String(text).split('\n')) {
      let line = '';
      for (const word of raw.split(/\s+/).filter(Boolean)) {
        const trial = line ? `${line} ${word}` : word;
        if (!line || widthOf(trial, false) <= width) line = trial; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    lines.slice(0, maxLines).forEach((l, i) => txt(l, x, y + i * lh));
  };

  const code = verificationCode({ receiptNo: d.receiptNo, amount: d.items.reduce((a, i) => a + i.amount, 0), paymentDate: d.paymentDate, clientName: d.clientName });

  doc.rect(0, 0, 595.28, 9).fill(BRAND);
  doc.rect(0, 774, 595.28, 68).fill(BRAND);

  if (fs.existsSync(LOGO)) doc.image(LOGO, L, 29, { width: 190 });
  doc.fontSize(8.4).fillColor(MUTED);
  txt(biz.address, L, 110, { width: 330, ellipsis: true });
  txt([biz.email, biz.phone].filter(Boolean).join('   |   '), L, 122, { width: 330, ellipsis: true });
  txt(biz.website, L, 134, { width: 330, ellipsis: true });

  doc.fontSize(23).fillColor(BRAND);
  txt('PAYMENT RECEIPT', 300, 40, { width: R - 300, align: 'right' }, true);
  [['RECEIPT NO.', d.receiptNo], ['DATE', fmtDate(d.date)], ['GSTIN / PAN (IF APPLICABLE)', d.gstin]].forEach(([label, val], i) => {
    const y = 79 + i * 32;
    doc.fontSize(6.5).fillColor(MUTED); txt(label, 395, y, {}, true);
    doc.fontSize(9.5).fillColor(INK); txt(val || '', 395, y + 10, { width: R - 395, ellipsis: true }, true);
    doc.moveTo(395, y + 23).lineTo(R, y + 23).lineWidth(0.5).strokeColor(LINE).stroke();
  });
  doc.moveTo(L, 176).lineTo(R, 176).lineWidth(0.6).strokeColor(LINE).stroke();

  const box = (x, title, rows) => {
    doc.roundedRect(x, 192, 250, 132, 9).lineWidth(0.7).fillAndStroke(TINT, LINE);
    doc.fontSize(8.5).fillColor(BRAND); txt(title, x + 14, 202, {}, true);
    rows.forEach(([label, val], i) => {
      const y = 220 + i * 25.5;
      doc.fontSize(6.3).fillColor(MUTED); txt(label, x + 14, y, {}, true);
      doc.fontSize(9).fillColor(INK); txt(val || '', x + 14, y + 8.5, { width: 222, ellipsis: true });
      doc.moveTo(x + 14, y + 20.5).lineTo(x + 236, y + 20.5).lineWidth(0.4).strokeColor(LINE).stroke();
    });
  };
  box(L, 'RECEIVED FROM', [['CLIENT NAME', d.clientName], ['BUSINESS / INSTITUTION', d.business], ['PHONE / WHATSAPP', d.phone], ['EMAIL', d.email]]);
  box(305, 'PAYMENT DETAILS', [['PAYMENT MODE (UPI / BANK / CASH)', d.paymentMode], ['TRANSACTION / REFERENCE ID', d.reference], ['PAYMENT DATE', fmtDate(d.paymentDate)], ['PROJECT / PLAN', d.projectPlan]]);

  doc.roundedRect(L, 345, R - L, 23, 5).fill(BRAND);
  doc.fontSize(8).fillColor('#fff');
  txt('#', L + 12, 353, {}, true); txt('DESCRIPTION', L + 56, 353, {}, true); txt('AMOUNT', R - 90, 353, { width: 78, align: 'right' }, true);
  for (let i = 0; i < 4; i++) {
    const y = 368 + i * 30;
    const it = d.items[i];
    doc.fontSize(8.5).fillColor(MUTED); txt(String(i + 1), L + 12, y + 11, {}, true);
    if (it) {
      doc.fontSize(10).fillColor(INK); txt(it.description || '', L + 56, y + 10, { width: 340, ellipsis: true });
      txt(`₹ ${inr(it.amount)}`, R - 120, y + 10, { width: 108, align: 'right' }, true);
    } else {
      doc.fontSize(10).fillColor(MUTED); txt('₹', 440, y + 10, {}, true);
    }
    doc.moveTo(L, y + 30).lineTo(R, y + 30).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  doc.fontSize(6.5).fillColor(MUTED); txt('AMOUNT RECEIVED IN WORDS', L, 505, {}, true);
  doc.roundedRect(L, 517, 275, 34, 4).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fontSize(9.5).fillColor(INK); para(amountInWords(d.items.reduce((a, i) => a + i.amount, 0)), L + 8, 527, 259, 2, 12);

  const totalRow = (label, val, y) => {
    doc.fontSize(11).fillColor(INK); txt(label, 345, y);
    txt(`₹ ${inr(val)}`, 440, y, { width: R - 440 - 6, align: 'right' }, true);
    doc.moveTo(335, y + 15).lineTo(R, y + 15).lineWidth(0.5).strokeColor(LINE).stroke();
  };
  totalRow('Total project cost', d.total, 510);
  totalRow(d.receivedLabel || 'Amount received', d.received, 538);
  doc.roundedRect(335, 558, R - 335, 26, 6).fill(BRAND);
  doc.fontSize(11).fillColor('#fff'); txt('Balance due', 345, 565, {}, true); txt(`₹ ${inr(d.balance)}`, 440, 565, { width: R - 440 - 10, align: 'right' }, true);

  doc.fontSize(6.5).fillColor(MUTED); txt('NOTES', L, 592, {}, true);
  doc.roundedRect(L, 603, R - L, 46, 4).lineWidth(0.5).strokeColor(LINE).stroke();
  if (d.notes) { doc.fontSize(9).fillColor(INK); para(d.notes, L + 8, 610, R - L - 16, 3, 12); }

  const full = d.balance <= 0;
  doc.fontSize(6.5).fillColor(MUTED); txt('PAYMENT STATUS', L, 678, {}, true);
  [[L, 'Paid in full', full], [149, 'Part payment', !full]].forEach(([x, label, on]) => {
    doc.roundedRect(x, 692, 13, 13, 1.5).lineWidth(1).strokeColor(on ? GREEN : '#F05A5A').stroke();
    if (on) doc.moveTo(x + 3, 698.5).lineTo(x + 5.8, 701.8).lineTo(x + 10.5, 695.2).lineWidth(1.6).strokeColor(GREEN).stroke();
    doc.fontSize(10).fillColor(INK); txt(label, x + 22, 693);
  });

  // digital verification stamp (replaces the handwritten signature)
  doc.fontSize(9).fillColor(INK); txt(`For ${biz.name}`, 300, 678, { width: R - 300, align: 'right', ellipsis: true }, true);
  const sx = 345, sy = 692, sw = R - sx, sh = 36;
  doc.roundedRect(sx, sy, sw, sh, 5).lineWidth(0.9).fillAndStroke('#F0FDF4', GREEN);
  doc.circle(sx + 15, sy + 18, 9).fill(GREEN);
  doc.moveTo(sx + 10.5, sy + 18).lineTo(sx + 14, sy + 21.5).lineTo(sx + 20, sy + 14.5).lineWidth(1.8).lineCap('round').strokeColor('#fff').stroke();
  doc.fontSize(10.5).fillColor(GREEN); txt(s.receipt.stampText, sx + 31, sy + 5, { width: sw - 36, ellipsis: true }, true);
  doc.fontSize(7).fillColor(MUTED);
  txt(`Verification ID: ${code}`, sx + 31, sy + 18.5, { width: sw - 36 });
  txt(`Issued ${fmtDate(d.date)}`, sx + 31, sy + 27, { width: sw - 36 });
  doc.moveTo(sx, 735).lineTo(R, 735).lineWidth(0.8).strokeColor(INK).stroke();
  doc.fontSize(7.5).fillColor(MUTED); txt('Authorised signatory (digital)', sx, 740, { width: sw, align: 'right' });

  doc.fontSize(10.5).fillColor('#fff'); txt(s.receipt.thankYou, 0, 783, { width: 595.28, align: 'center', ellipsis: true }, true);
  doc.fontSize(7.2).fillColor('#fff');
  txt([biz.whatsapp && `WhatsApp ${biz.whatsapp}`, biz.email, biz.website].filter(Boolean).join('  •  '), 0, 802, { width: 595.28, align: 'center', ellipsis: true });
  txt([biz.instagram && `Instagram ${biz.instagram}`, biz.linkedin && `LinkedIn: ${biz.linkedin}`, biz.address].filter(Boolean).join('  •  '), 0, 814, { width: 595.28, align: 'center', ellipsis: true });
}

// Resolves with a Buffer (receipts are one page, so buffering is simpler and safer than streaming).
export const renderReceiptPdf = (data, settings) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4', margin: 0,
        info: { Title: `Payment Receipt ${data.receiptNo}`, Author: settings.business.name, Creator: 'Codexora Client Portal' },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc, data, settings);
      doc.end();
    } catch (err) { reject(err); }
  });
