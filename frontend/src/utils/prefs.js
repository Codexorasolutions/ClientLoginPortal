// The owner's date-format preference (My Account → Preferences), kept in localStorage so every screen can read it
// without an extra request. Saved on the server too; My Account refreshes this copy whenever it loads or saves.
const KEY = 'cx_prefs';
export const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];

export const getPrefs = () => {
  try { return { dateFormat: 'DD MMM YYYY', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { dateFormat: 'DD MMM YYYY' }; }
};
export const setPrefs = (p) => localStorage.setItem(KEY, JSON.stringify({ ...getPrefs(), ...p }));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Formats in India time (the portal's business timezone) using the chosen pattern.
export function formatDate(value, { time = false, format } = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const ist = new Date(d.getTime() + 330 * 60000);
  const [Y, M, D] = [ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()];
  const p2 = (n) => String(n).padStart(2, '0');
  const f = format || getPrefs().dateFormat;
  const day = f === 'DD/MM/YYYY' ? `${p2(D)}/${p2(M + 1)}/${Y}` : f === 'MM/DD/YYYY' ? `${p2(M + 1)}/${p2(D)}/${Y}` : f === 'YYYY-MM-DD' ? `${Y}-${p2(M + 1)}-${p2(D)}` : `${p2(D)} ${MONTHS[M]} ${Y}`;
  if (!time) return day;
  const h = ist.getUTCHours();
  return `${day}, ${p2(h % 12 || 12)}:${p2(ist.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}
