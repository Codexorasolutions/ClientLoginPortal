// Owner dashboard → "Users": every account that can sign in, with search, filters, bulk actions, a detail drawer,
// CSV export and its own audit trail.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios.js';
import Avatar from './Avatar.jsx';
import StatusBadge, { STATUS_LABELS } from './StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import UserDrawer from './UserDrawer.jsx';
import AuditLogTab from './AuditLogTab.jsx';
import EmptyState from './EmptyState.jsx';
import { useToasts } from './Toast.jsx';
import { downloadFile } from '../utils/download.js';
import { formatDate } from '../utils/prefs.js';

const EMPTY = { q: '', status: '', sort: 'newest' };
const STATS = [['total', '👥', 'Total users', ''], ['active', '✅', 'Active', 'active'], ['pending', '⏳', 'Pending approval', 'pending'], ['suspended', '⏸️', 'Suspended', 'suspended'], ['terminated', '⛔', 'Terminated', 'terminated']];
const tomorrow = () => new Date(Date.now() + 330 * 60000 + 864e5).toISOString().slice(0, 10);

export default function UsersTab({ onChanged }) {
  const [view, setView] = useState('users');           // users | audit
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1, stats: null });
  const [state, setState] = useState('loading');       // loading | ready | error
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const [bulk, setBulk] = useState(null);              // 'approve' | 'suspend' | 'reactivate' | 'terminate'
  const [bulkUntil, setBulkUntil] = useState('');
  const [result, setResult] = useState(null);          // outcome of the last bulk action
  const [exporting, setExporting] = useState(false);
  const { push, node } = useToasts();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return undefined; }
    const t = setTimeout(() => { setApplied(filters); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [filters.q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setApplied((a) => ({ ...a, status: filters.status, sort: filters.sort })); setPage(1); }, [filters.status, filters.sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setState('loading');
    const params = { ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), page, limit: 15 };
    api.get('/owner/users', { params }).then((r) => { setData(r.data); setState('ready'); setSelected(new Set()); }).catch(() => setState('error'));
  }, [applied, page]);
  useEffect(load, [load]);

  const changed = () => { load(); onChanged?.(); };
  const filtered = Boolean(applied.q || applied.status);
  const rows = data.items;
  const selectable = rows.filter((u) => u.role !== 'owner');
  const picked = useMemo(() => rows.filter((u) => selected.has(u._id)), [rows, selected]);
  const allPending = picked.length > 0 && picked.every((u) => u.status === 'pending');
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected((s) => (s.size === selectable.length ? new Set() : new Set(selectable.map((u) => u._id))));

  const exportCsv = async () => {
    setExporting(true);
    try { await downloadFile('/owner/users/export', Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), 'users.csv'); push('Users exported'); } catch { push('Could not export. Please try again.', 'error'); } finally { setExporting(false); }
  };

  const runBulk = async (extra = {}) => {
    const body = { action: bulk, ids: picked.map((u) => u._id), ...extra };
    const { data: r } = await api.post('/owner/users/bulk', body);
    setBulk(null); setBulkUntil(''); setResult({ action: bulk, ...r });
    push(`${r.summary.succeeded} of ${r.summary.requested} done`, r.summary.failed ? 'error' : 'ok');
    changed();
  };

  const bulkNames = picked.slice(0, 3).map((u) => u.businessName || u.fullName).join(', ') + (picked.length > 3 ? ` and ${picked.length - 3} more` : '');

  return (
    <div className="us-wrap">
      <nav className="tool-tabs" aria-label="Users sections">
        <button type="button" className={view === 'users' ? 'on' : ''} onClick={() => setView('users')}>Users</button>
        <button type="button" className={view === 'audit' ? 'on' : ''} onClick={() => setView('audit')}>Audit log</button>
      </nav>

      {view === 'audit' ? (
        <AuditLogTab endpoint="/owner/audit-log" fixedParams={{ scope: 'users' }} csvPath="/owner/audit-log/export" actionPattern={/^(user\.|client\.(approve|reject)$)/} />
      ) : (
        <>
          <div className="stat-grid" aria-label="User counts">
            {STATS.map(([key, icon, label, status]) => (
              <button type="button" key={key} className={`stat us-stat${filters.status === status && status ? ' on' : ''}`} onClick={() => setFilters((f) => ({ ...f, status: f.status === status ? '' : status }))} aria-pressed={!!status && filters.status === status} disabled={!status}>
                <div className="stat-icon">{icon}</div>
                <div className="num">{data.stats ? data.stats[key] : <span className="sk-block sk-num" />}</div>
                <div className="lab">{label}</div>
              </button>
            ))}
          </div>

          <div className="us-toolbar">
            <div className="us-search"><label htmlFor="us-q">Search</label><input id="us-q" type="search" placeholder="Name, email, phone, business or client ID" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} /></div>
            <div><label htmlFor="us-st">Status</label><select id="us-st" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label htmlFor="us-so">Sort by</label><select id="us-so" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}><option value="newest">Newest first</option><option value="lastLogin">Last login</option><option value="name">Name (A–Z)</option></select></div>
            {filtered && <button type="button" className="btn-sm ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); setPage(1); }}>Clear filters</button>}
            <button type="button" className="btn-sm ghost" onClick={exportCsv} disabled={exporting}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
          </div>

          {picked.length > 0 && (
            <div className="us-bulk" role="region" aria-label="Bulk actions">
              <strong>{picked.length} selected</strong>
              <button type="button" className="btn-sm primary" onClick={() => setBulk('approve')} disabled={!allPending} title={allPending ? '' : 'Only pending users can be approved'}>Approve</button>
              <button type="button" className="btn-sm ghost" onClick={() => { setBulkUntil(''); setBulk('suspend'); }}>Suspend</button>
              <button type="button" className="btn-sm ghost" onClick={() => setBulk('reactivate')}>Reactivate</button>
              <button type="button" className="btn-sm reject" onClick={() => setBulk('terminate')}>Terminate</button>
              <button type="button" className="btn-sm ghost" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {state === 'error' && <p className="error-text" role="alert">Could not load users. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p>}
          {state === 'loading' && rows.length === 0 && (
            <div className="us-list" aria-busy="true" aria-label="Loading users">{[0, 1, 2, 3, 4].map((i) => <div className="us-row sk" key={i}><div className="sk-line" style={{ width: '60%' }} /><div className="sk-line" style={{ width: '30%' }} /></div>)}</div>
          )}
          {state === 'ready' && rows.length === 0 && (
            <div className="panel"><EmptyState icon="👥" title={filtered ? 'No users match these filters' : 'No users yet'} hint={filtered ? 'Try a different search or clear the filters.' : 'People who sign up will appear here.'} action={filtered ? <button type="button" className="btn-sm ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}>Clear filters</button> : null} /></div>
          )}

          {rows.length > 0 && (
            <div className={`us-list${state === 'loading' ? ' busy' : ''}`} role="table" aria-label="Users">
              <div className="us-row us-headrow" role="row">
                <span role="columnheader"><input type="checkbox" aria-label="Select all users on this page" checked={selectable.length > 0 && selected.size === selectable.length} onChange={toggleAll} disabled={selectable.length === 0} /></span>
                <span role="columnheader">User</span><span role="columnheader">Phone</span><span role="columnheader">Business</span><span role="columnheader">Status</span><span role="columnheader">Signed up</span><span role="columnheader">Last login</span><span role="columnheader">Projects</span><span />
              </div>
              {rows.map((u) => (
                <div className={`us-row${selected.has(u._id) ? ' sel' : ''}`} role="row" key={u._id}>
                  <span><input type="checkbox" aria-label={`Select ${u.fullName}`} checked={selected.has(u._id)} onChange={() => toggle(u._id)} disabled={u.role === 'owner'} /></span>
                  <button type="button" className="us-user" onClick={() => setOpenId(u._id)}>
                    <Avatar name={u.fullName} src={u.avatarUrl} size={38} />
                    <span className="us-ident"><strong>{u.fullName}</strong><span className="muted">{u.email}</span></span>
                  </button>
                  <span className="us-cell" data-label="Phone">{u.phone || <span className="muted">—</span>}</span>
                  <span className="us-cell" data-label="Business">{u.businessName || <span className="muted">—</span>}</span>
                  <span className="us-cell" data-label="Status"><StatusBadge status={u.status} />{u.role === 'owner' && <span className="us-status owner">Owner</span>}</span>
                  <span className="us-cell" data-label="Signed up">{formatDate(u.createdAt)}</span>
                  <span className="us-cell" data-label="Last login">{u.lastLoginAt ? formatDate(u.lastLoginAt) : <span className="muted">Never</span>}</span>
                  <span className="us-cell" data-label="Projects">{u.projects}</span>
                  <span className="us-cell us-go"><button type="button" className="btn-sm ghost" onClick={() => setOpenId(u._id)}>Manage</button></span>
                </div>
              ))}
            </div>
          )}

          {data.total > 0 && (
            <div className="rc-pager">
              <span>{data.total} {data.total === 1 ? 'user' : 'users'}</span>
              <button type="button" className="btn-sm ghost" disabled={page <= 1 || state === 'loading'} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {data.page || page} of {data.pages}</span>
              <button type="button" className="btn-sm ghost" disabled={page >= data.pages || state === 'loading'} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {openId && <UserDrawer userId={openId} onClose={() => setOpenId(null)} onChanged={changed} onToast={push} />}

      {bulk === 'approve' && <ConfirmDialog title={`Approve ${picked.length} user${picked.length === 1 ? '' : 's'}?`} confirmLabel="Approve all" onClose={() => setBulk(null)} onConfirm={() => runBulk()}><p className="muted">{bulkNames}. Each gets a client ID and an email.</p></ConfirmDialog>}
      {bulk === 'suspend' && (
        <ConfirmDialog title={`Suspend ${picked.length} user${picked.length === 1 ? '' : 's'}?`} confirmLabel="Suspend all" danger reason reasonHint="Included in each email" onClose={() => setBulk(null)} onConfirm={({ reason }) => runBulk({ reason, until: bulkUntil || undefined })}>
          <p className="muted">{bulkNames}. They are signed out immediately and emailed.</p>
          <div className="tool-field"><label htmlFor="bulk-until">Reactivate automatically on (optional)</label><input id="bulk-until" type="date" min={tomorrow()} value={bulkUntil} onChange={(e) => setBulkUntil(e.target.value)} /></div>
        </ConfirmDialog>
      )}
      {bulk === 'reactivate' && <ConfirmDialog title={`Reactivate ${picked.length} user${picked.length === 1 ? '' : 's'}?`} confirmLabel="Reactivate all" onClose={() => setBulk(null)} onConfirm={() => runBulk()}><p className="muted">{bulkNames}. Only suspended accounts are affected.</p></ConfirmDialog>}
      {bulk === 'terminate' && (
        <ConfirmDialog title={`Terminate ${picked.length} user${picked.length === 1 ? '' : 's'}?`} confirmLabel="Terminate all" danger reason reasonRequired reasonHint="Required — included in each email" typeToConfirm="TERMINATE" typeExact typeLabel="Type TERMINATE to confirm" onClose={() => setBulk(null)} onConfirm={({ reason }) => runBulk({ reason, confirm: 'TERMINATE' })}>
          <p className="muted">{bulkNames}. None of them can sign in any more. Their data is kept and each account can be restored.</p>
        </ConfirmDialog>
      )}
      {result && (
        <div className="rc-modal-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setResult(null); }}>
          <div className="rc-modal rc-small cd-dialog" role="dialog" aria-modal="true" aria-label="Bulk action result">
            <h3 className="section-title" style={{ marginTop: 0 }}>{result.summary.succeeded} of {result.summary.requested} done</h3>
            {result.summary.failed > 0 ? (
              <ul className="us-plain">{result.results.filter((r) => !r.ok).map((r) => <li key={r.id}><span className="error-text">{r.message}</span></li>)}</ul>
            ) : <p className="muted">All selected users were updated.</p>}
            {result.results.some((r) => r.ok && r.emailSent === false) && <p className="muted">Some emails could not be sent — the accounts were still updated.</p>}
            <div className="rc-actions"><button type="button" className="btn-sm primary" onClick={() => setResult(null)}>Close</button></div>
          </div>
        </div>
      )}
      {node}
    </div>
  );
}
