// RFC 4180 CSV: every cell quoted when needed, CRLF line ends, UTF-8 BOM so Excel shows Hindi/Devanagari correctly.
// Cells that start with = + - @ (or a tab/CR) get a leading apostrophe so a client named "=HYPERLINK(...)" cannot run as a formula.
const needsQuote = /[",\r\n]/;

export const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return needsQuote.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns: [{ header: 'Name', value: (row) => row.name }]
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function sendCsv(res, filename, csv) {
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(csv);
}
