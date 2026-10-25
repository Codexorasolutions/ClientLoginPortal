import api from '../api/axios.js';

// Receipt PDFs need the login token, so they are fetched as a blob (a plain <a href> / <iframe src> could not send it).
export async function fetchReceiptPdf(id, { download = false } = {}) {
  const { data } = await api.get(`/owner/receipts/${id}/pdf`, { params: download ? { download: 1 } : {}, responseType: 'blob' });
  return data;
}

export async function downloadReceipt(receipt) {
  const blob = await fetchReceiptPdf(receipt._id, { download: true });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${receipt.receiptNumber}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Prints the PDF through a hidden frame, so the owner never has to leave the dashboard.
export async function printReceipt(receipt) {
  const blob = await fetchReceiptPdf(receipt._id);
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.src = url;
  frame.onload = () => {
    setTimeout(() => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch { /* the PDF viewer toolbar still has a print button */ }
    }, 400);
  };
  document.body.appendChild(frame);
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 120000);
}

export const inr = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(num) ? 0 : 2, maximumFractionDigits: 2 });
};
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

export const STATUS = {
  paid_in_full: { label: 'Paid in full', tag: 'paid' },
  part_payment: { label: 'Part payment', tag: 'open' },
  unpaid: { label: 'Unpaid', tag: 'due' },
  cancelled: { label: 'Cancelled', tag: 'closed' },
};
