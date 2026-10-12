// AuditLogTab.jsx — owner dashboard → Audit log (read-only). Styles: styles/owner-tools.css.
import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios.js';

const fmtFull = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const ago = (d) => {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const deviceOf = (ua = '') => {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' on ');
};
const EMPTY = { action: '', q: '', from: '', to: '' };

function MetaView({ meta }) {
  if (!meta) return null;
  const rows = [];
  if (Array.isArray(meta.changed)) rows.push(['Changed', meta.changed.map((c) => (typeof c === 'string' ? c : `${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`)).join('\n')]);
  Object.entries(meta).filter(([k]) => k !== 'changed').forEach(([k, v]) => rows.push([k, typeof v === 'string' ? v : JSON.stringify(v, null, 2)]));
  return rows.map(([k, v]) => (<div key={k} className="au-kv"><dt>{k}</dt><dd>{v}</dd></div>));
}

export default function AuditLogTab() {
  const [catalog, setCatalog] = useState({});
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);   // q is debounced, the rest apply instantly
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [state, setState] = useState('loading');   // loading | ready | error
  const [open, setOpen] = useState(null);

  useEffect(() => { api.get('/owner/audit/actions').then((r) => setCatalog(r.data)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => { setApplied(filters); setPage(1); }, filters.q === applied.q ? 0 : 350); return () => clearTimeout(t); }, [filters]); // eslint-disable-line

  const load = useCallback(() => {
    setState('loading');
    const params = { ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), page, limit: 25 };
    api.get('/owner/audit', { params }).then((r) => { setData(r.data); setState('ready'); setOpen(null); }).catch(() => setState('error'));
  }, [applied, page]);
  useEffect(load, [load]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const filtered = Object.values(applied).some(Boolean);

  return (
    <div className="tool-wrap">
      <div className="au-filters">
        <div>
          <label htmlFor="au-action">Action</label>
          <select id="au-action" value={filters.action} onChange={set('action')}>
            <option value="">All actions</option>
            {Object.entries(catalog).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="au-from">From</label>
          <input id="au-from" type="date" value={filters.from} onChange={set('from')} max={filters.to || undefined} />
        </div>
        <div>
          <label htmlFor="au-to">To</label>
          <input id="au-to" type="date" value={filters.to} onChange={set('to')} min={filters.from || undefined} />
        </div>
        <div className="au-search">
          <label htmlFor="au-q">Search</label>
          <input id="au-q" type="search" placeholder="Client, invoice or person" value={filters.q} onChange={set('q')} />
        </div>
        {filtered && <button type="button" className="btn-sm ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); setPage(1); }}>Clear filters</button>}
      </div>

      {state === 'error' && <p className="au-msg err" role="alert">Could not load the activity log. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p>}
      {state === 'loading' && !data.items.length && <p className="au-msg">Loading activity…</p>}
      {state === 'ready' && !data.items.length && (
        <p className="au-msg">{filtered ? 'No activity matches these filters.' : 'No activity recorded yet. Approvals, deletions and setting changes will appear here.'}</p>
      )}

      {data.items.length > 0 && (
        <ul className={`au-list${state === 'loading' ? ' busy' : ''}`}>
          {data.items.map((it) => {
            const lvl = catalog[it.action]?.level || 'info';
            const isOpen = open === it._id;
            return (
              <li key={it._id} className={`au-item ${lvl}`}>
                <button type="button" className="au-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : it._id)}>
                  <span className={`au-badge ${lvl}`}>{catalog[it.action]?.label || it.action}</span>
                  <span className="au-what">{it.summary}</span>
                  <span className="au-who">{it.actor?.name || it.actor?.email || 'Unknown'}</span>
                  <time dateTime={it.createdAt} title={fmtFull(it.createdAt)}>{ago(it.createdAt)}</time>
                </button>
                {isOpen && (
                  <dl className="au-detail">
                    <div className="au-kv"><dt>When</dt><dd>{fmtFull(it.createdAt)}</dd></div>
                    <div className="au-kv"><dt>Who</dt><dd>{[it.actor?.name, it.actor?.email, it.actor?.role].filter(Boolean).join(' · ') || '—'}</dd></div>
                    {it.entityType && <div className="au-kv"><dt>Item</dt><dd>{[it.entityType, it.entityLabel, it.entityId].filter(Boolean).join(' · ')}</dd></div>}
                    <MetaView meta={it.meta} />
                    <div className="au-kv"><dt>From</dt><dd>{[it.ip, deviceOf(it.userAgent)].filter(Boolean).join(' · ') || '—'}</dd></div>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data.total > 0 && (
        <div className="au-pager">
          <span>{data.total} {data.total === 1 ? 'entry' : 'entries'}</span>
          <button type="button" className="btn-sm ghost" disabled={page <= 1 || state === 'loading'} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {data.page || page} of {data.pages}</span>
          <button type="button" className="btn-sm ghost" disabled={page >= data.pages || state === 'loading'} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
