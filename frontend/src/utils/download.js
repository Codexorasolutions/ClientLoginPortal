import api from '../api/axios.js';

// Downloads a file from a login-protected API route (CSV / JSON exports). Returns the file name used.
export async function downloadFile(path, params = {}, fallbackName = 'download') {
  const res = await api.get(path, { params, responseType: 'blob' });
  const header = res.headers?.['content-disposition'] || '';
  const name = (/filename="?([^";]+)"?/i.exec(header) || [])[1] || fallbackName;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
