import api from '../api/axios.js';

// Same idea as downloadInvoicePdf: the endpoint needs the JWT header, so fetch as a blob and trigger the download.
export default async function downloadReceiptPdf(role, invoice) {
  const base = role === 'owner' ? '/owner' : '/client';
  const { data } = await api.get(`${base}/invoices/${invoice._id}/receipt`, { responseType: 'blob' });

  const num = (invoice.invoiceNumber || `INV-${String(invoice._id).slice(-6).toUpperCase()}`).replace(/^INV-/, 'RCT-');
  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${num}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
