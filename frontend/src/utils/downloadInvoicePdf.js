import api from '../api/axios.js';

// The PDF endpoints need the JWT in an Authorization header, which a plain
// <a href> can't send — so fetch it as a blob and trigger the download.
export default async function downloadInvoicePdf(role, invoice) {
  const base = role === 'owner' ? '/owner' : '/client';
  const { data } = await api.get(`${base}/invoices/${invoice._id}/pdf`, { responseType: 'blob' });

  const url = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invoice.invoiceNumber || `INV-${String(invoice._id).slice(-6).toUpperCase()}`}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
