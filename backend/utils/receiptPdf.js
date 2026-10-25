// Payment receipt PDF (A4) — drawn ONLY from a saved Receipt record. Layout follows Sample_Receipt_Output.pdf.
// Fonts: Carlito (has the ₹ sign) + Noto Sans Devanagari for Hindi names; both live in backend/assets/fonts.
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { inr, amountInWords } from './receiptCore.js';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FONT = (f) => path.join(ASSETS, 'fonts', f);
const LOGO = path.join(ASSETS, 'codexora-logo.png');

const BRAND = '#554CF9';
const INK = '#1B1B2F';
const MUTED = '#7A7F99';
const LINE = '#D5D8EE';
const TINT = '#F3F3FD';
const GREEN = '#15803D';
const RED = '#DC2626';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const fmtDateTime = (d) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST';

// ---- vertical layout: how tall the rows are and where each block starts -----------------------
// Four rows at full size reproduces the sample exactly. More rows / a "Previously received" line make everything
// compress (smaller rows, tighter gaps) until it fits above the footer; nothing is ever drawn over the footer.
const FOOTER_TOP = 774;
const C_BLOCK = 70;          // payment status + stamp block height
const C_LABEL_MAX = FOOTER_TOP - C_BLOCK - 8;

export function layoutFor(rowCount, plainTotalRows) {
  const n = Math.max(4, rowCount);
  for (const rowH of [30, 28, 26, 24, 22, 20, 18, 17]) {
    for (const rowGap of [28, 24, 20]) {
      const tb = 368 + n * rowH;
      const aTop = tb + 17;
      const barY = aTop + 5 + rowGap * plainTotalRows - 8;
      const aBottom = barY + 26;
      for (const [notesH, gap, aGap] of [[46, 29, 8], [38, 22, 8], [30, 16, 6], [26, 12, 6]]) {
        const nLabel = aBottom + aGap;
        const cLabel = nLabel + 11 + notesH + gap;
        if (cLabel <= C_LABEL_MAX) return { rowH, rowGap, tb, aTop, barY, nLabel, notesH, cLabel, fits: true };
      }
    }
  }
  return { fits: false };
}

// ---- drawing -------------------------------------------------------------------------------------
function draw(doc, r) {
  const L = 40, R = 554;
  const biz = r.issuer || {};
  doc.registerFont('R', FONT('Carlito-Regular.ttf'));
  doc.registerFont('B', FONT('Carlito-Bold.ttf'));
  const hasDev = fs.existsSync(FONT('NotoSansDevanagari-Regular.ttf'));
  if (hasDev) {
    doc.registerFont('DR', FONT('NotoSansDevanagari-Regular.ttf'));
    doc.registerFont('DB', FONT('NotoSansDevanagari-Bold.ttf'));
  }
  // Mixed text ("आरडी स्कूल (RD School)") is split into runs: Hindi runs use the Hindi font, the rest Carlito.
  const isDev = (ch) => /[\u0900-\u097F\u200C\u200D]/.test(ch);
  const runs = (text) => {
    const out = [];
    let cur = '', curDev = null;
    for (const ch of String(text)) {
      const dv = /\s/.test(ch) ? (curDev ?? false) : isDev(ch);
      if (curDev !== null && dv !== curDev && cur) { out.push({ t: cur, dev: curDev }); cur = ''; }
      curDev = dv; cur += ch;
    }
    if (cur) out.push({ t: cur, dev: curDev });
    return out;
  };
  const fontOf = (dev, bold) => (hasDev && dev ? (bold ? 'DB' : 'DR') : (bold ? 'B' : 'R'));
  const widthOf = (text, bold) => runs(text).reduce((w, x) => { doc.font(fontOf(x.dev, bold)); return w + doc.widthOfString(x.t); }, 0);
  // one line of text; honours width / align / ellipsis (set fontSize + fillColor first)
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
    for (const x2 of runs(str)) { doc.font(fontOf(x2.dev, bold)); doc.text(x2.t, cx, y, { lineBreak: false }); cx += doc.widthOfString(x2.t); }
  };
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

  const items = r.items.slice(0, 10);
  const prev = Number(r.receivedBefore) > 0;
  const lay = layoutFor(items.length, prev ? 3 : 2);

  // bars
  doc.rect(0, 0, 595.28, 9).fill(BRAND);
  doc.rect(0, FOOTER_TOP, 595.28, 842 - FOOTER_TOP).fill(BRAND);

  // header
  if (fs.existsSync(LOGO)) doc.image(LOGO, L, 29, { width: 190 });
  doc.fontSize(8.4).fillColor(MUTED);
  txt(biz.address, L, 110, { width: 330, ellipsis: true });
  txt([biz.email, biz.phone].filter(Boolean).join('   |   '), L, 122, { width: 330, ellipsis: true });
  txt(biz.website, L, 134, { width: 330, ellipsis: true });
  // optional payment details from My Account / Settings — shown only when filled in
  if (biz.upiId) txt(`UPI: ${biz.upiId}`, L, 146, { width: 330, ellipsis: true });
  if (biz.bankDetails) txt(`Bank: ${biz.bankDetails}`, L, biz.upiId ? 158 : 146, { width: 330, ellipsis: true });

  doc.fontSize(23).fillColor(BRAND);
  txt('PAYMENT RECEIPT', 300, 40, { width: R - 300, align: 'right' }, true);
  [['RECEIPT NO.', r.receiptNumber], ['DATE', fmtDate(r.createdAt)], ['GSTIN / PAN (IF APPLICABLE)', biz.gstin || biz.pan || '']].forEach(([label, val], i) => {
    const y = 79 + i * 32;
    doc.fontSize(6.5).fillColor(MUTED); txt(label, 395, y, {}, true);
    doc.fontSize(9.5).fillColor(INK); txt(val || '', 395, y + 10, { width: R - 395, ellipsis: true }, true);
    doc.moveTo(395, y + 23).lineTo(R, y + 23).lineWidth(0.5).strokeColor(LINE).stroke();
  });
  doc.moveTo(L, 176).lineTo(R, 176).lineWidth(0.6).strokeColor(LINE).stroke();

  // info boxes
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
  box(L, 'RECEIVED FROM', [['CLIENT NAME', r.clientName], ['BUSINESS / INSTITUTION', r.clientBusiness], ['PHONE / WHATSAPP', r.clientPhone], ['EMAIL', r.clientEmail]]);
  box(305, 'PAYMENT DETAILS', [['PAYMENT MODE (UPI / BANK / CASH)', r.paymentMode], ['TRANSACTION / REFERENCE ID', r.transactionId], ['PAYMENT DATE', fmtDate(r.paymentDate)], ['PROJECT / PLAN', r.projectPlan]]);

  // description table (at least 4 rows are always drawn, like the sample)
  doc.roundedRect(L, 345, R - L, 23, 5).fill(BRAND);
  doc.fontSize(8).fillColor('#fff');
  txt('#', L + 12, 353, {}, true); txt('DESCRIPTION', L + 56, 353, {}, true); txt('AMOUNT (₹)', R - 90, 353, { width: 78, align: 'right' }, true);
  const rows = Math.max(4, items.length);
  const fs1 = lay.rowH >= 26 ? 10 : lay.rowH >= 20 ? 9 : 8.5;
  for (let i = 0; i < rows; i++) {
    const y = 368 + i * lay.rowH;
    const it = items[i];
    const ty = y + (lay.rowH - fs1) / 2 - 1;
    doc.fontSize(Math.min(8.5, fs1)).fillColor(MUTED); txt(String(i + 1), L + 12, ty + 0.5, {}, true);
    if (it) {
      doc.fontSize(fs1).fillColor(INK); txt(it.description || '', L + 56, ty, { width: 340, ellipsis: true });
      txt(`₹ ${inr(it.amount)}`, R - 120, ty, { width: 108, align: 'right' }, true);
    } else {
      doc.fontSize(fs1).fillColor(MUTED); txt('₹', 440, ty, {}, true);
    }
    doc.moveTo(L, y + lay.rowH).lineTo(R, y + lay.rowH).lineWidth(0.5).strokeColor(LINE).stroke();
  }

  // amount in words (this receipt) + summary
  doc.fontSize(6.5).fillColor(MUTED); txt('AMOUNT RECEIVED IN WORDS', L, lay.aTop, {}, true);
  doc.roundedRect(L, lay.aTop + 12, 275, 34, 4).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fontSize(9.5).fillColor(INK); para(amountInWords(r.amountReceived), L + 8, lay.aTop + 22, 259, 2, 12);

  const sumRow = (label, val, i, strong = false) => {
    const y = lay.aTop + 5 + lay.rowGap * i;
    doc.fontSize(11).fillColor(INK); txt(label, 345, y);
    txt(`₹ ${inr(val)}`, 440, y, { width: R - 440 - 6, align: 'right' }, true);
    doc.moveTo(335, y + 15).lineTo(R, y + 15).lineWidth(0.5).strokeColor(LINE).stroke();
  };
  let i = 0;
  sumRow('Total project cost', r.totalProjectCost, i++);
  if (prev) sumRow('Received earlier', r.receivedBefore, i++);
  sumRow(prev ? 'Amount received (this receipt)' : 'Amount received', r.amountReceived, i++);
  const credit = Number(r.balanceDue) < 0;
  doc.roundedRect(335, lay.barY, R - 335, 26, 6).fill(credit ? GREEN : BRAND);
  doc.fontSize(11).fillColor('#fff'); txt(credit ? 'Credit (overpaid)' : 'Balance due', 345, lay.barY + 7, {}, true);
  txt(`₹ ${inr(Math.abs(r.balanceDue))}`, 440, lay.barY + 7, { width: R - 440 - 10, align: 'right' }, true);

  // notes
  doc.fontSize(6.5).fillColor(MUTED); txt('NOTES', L, lay.nLabel, {}, true);
  doc.roundedRect(L, lay.nLabel + 11, R - L, lay.notesH, 4).lineWidth(0.5).strokeColor(LINE).stroke();
  if (r.notes) { doc.fontSize(9).fillColor(INK); para(r.notes, L + 8, lay.nLabel + 17, R - L - 16, Math.max(1, Math.floor((lay.notesH - 8) / 12)), 12); }

  // payment status
  const sy = lay.cLabel;
  const key = r.voided ? null : r.status;
  doc.fontSize(6.5).fillColor(MUTED); txt('PAYMENT STATUS', L, sy, {}, true);
  [[L, 'Paid in full', 'paid_in_full', GREEN], [149, 'Part payment', 'part_payment', GREEN], [258, 'Unpaid', 'unpaid', RED]].forEach(([x, label, k, col]) => {
    const on = key === k;
    doc.roundedRect(x, sy + 14, 13, 13, 1.5).lineWidth(1).strokeColor(on ? col : '#F05A5A').stroke();
    if (on) doc.moveTo(x + 3, sy + 20.5).lineTo(x + 5.8, sy + 23.8).lineTo(x + 10.5, sy + 17.2).lineWidth(1.6).strokeColor(col).stroke();
    doc.fontSize(10).fillColor(INK); txt(label, x + 22, sy + 15);
  });

  // verification stamp — shown only because the record holds a verification event; a cancelled receipt shows no "verified" claim
  doc.fontSize(9).fillColor(INK); txt(`For ${biz.name || ''}`, 300, sy, { width: R - 300, align: 'right', ellipsis: true }, true);
  const sx = 345, sby = sy + 14, sw = R - sx, sh = 36;
  const v = r.verification || {};
  if (r.voided) {
    doc.roundedRect(sx, sby, sw, sh, 5).lineWidth(0.9).fillAndStroke('#FEF2F2', RED);
    doc.fontSize(10.5).fillColor(RED); txt('Cancelled — not a valid receipt', sx + 10, sby + 6, { width: sw - 20, ellipsis: true }, true);
    doc.fontSize(7).fillColor(MUTED);
    txt(`Cancelled on ${r.voidedAt ? fmtDateTime(r.voidedAt) : ''}`, sx + 10, sby + 19.5, { width: sw - 20 });
    txt(`Was verification ID: ${v.id || ''}`, sx + 10, sby + 28, { width: sw - 20 });
  } else if (v.id && v.signedAt) {
    doc.roundedRect(sx, sby, sw, sh, 5).lineWidth(0.9).fillAndStroke('#F0FDF4', GREEN);
    doc.circle(sx + 15, sby + 18, 9).fill(GREEN);
    doc.moveTo(sx + 10.5, sby + 18).lineTo(sx + 14, sby + 21.5).lineTo(sx + 20, sby + 14.5).lineWidth(1.8).lineCap('round').strokeColor('#fff').stroke();
    doc.fontSize(10.5).fillColor(GREEN); txt(biz.stampText || 'Digitally verified by Codexora', sx + 31, sby + 5, { width: sw - 36, ellipsis: true }, true);
    doc.fontSize(7).fillColor(MUTED);
    txt(`Verification ID: ${v.id}`, sx + 31, sby + 18.5, { width: sw - 36 });
    txt(`Signed on ${fmtDateTime(v.signedAt)}`, sx + 31, sby + 27, { width: sw - 36 });
  }
  doc.moveTo(sx, sby + 43).lineTo(R, sby + 43).lineWidth(0.8).strokeColor(INK).stroke();
  doc.fontSize(7.5).fillColor(MUTED); txt('Authorised signatory (digital)', sx, sby + 48, { width: sw, align: 'right' });

  // footer
  doc.fontSize(10.5).fillColor('#fff'); txt(biz.thankYou || '', 0, 783, { width: 595.28, align: 'center', ellipsis: true }, true);
  doc.fontSize(7.2).fillColor('#fff');
  txt([biz.whatsapp && `WhatsApp ${biz.whatsapp}`, biz.email, biz.website].filter(Boolean).join('  •  '), 0, 802, { width: 595.28, align: 'center', ellipsis: true });
  txt([biz.instagram && `Instagram ${biz.instagram}`, biz.linkedin && `LinkedIn: ${biz.linkedin}`, biz.address].filter(Boolean).join('  •  '), 0, 814, { width: 595.28, align: 'center', ellipsis: true });

  // watermark on cancelled receipts
  if (r.voided) {
    doc.save();
    doc.rotate(-35, { origin: [297, 420] });
    doc.fillOpacity(0.13).fontSize(92).fillColor(RED);
    txt('CANCELLED', 40, 380, { width: 515, align: 'center' }, true);
    doc.restore();
  }
}

// Resolves with a Buffer. Receipts are one page, so buffering is simpler and safer than streaming.
export const renderReceiptPdf = (receipt) =>
  new Promise((resolve, reject) => {
    try {
      const r = receipt.toObject ? receipt.toObject() : receipt;
      const doc = new PDFDocument({
        size: 'A4', margin: 0, autoFirstPage: true,
        info: { Title: `Payment Receipt ${r.receiptNumber}`, Author: r.issuer?.name || 'Codexora Solutions', Creator: 'Codexora Client Portal', Subject: `Receipt for ${r.clientName || ''}` },
      });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      draw(doc, r);
      doc.end();
    } catch (err) { reject(err); }
  });
