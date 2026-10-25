// Users → one person: profile, private notes, status history, login history, activity, and every access-control action.
// Each risky action goes through a confirmation dialog (reason / typed confirmation where it matters).
import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios.js';
import Avatar from './Avatar.jsx';
import StatusBadge from './StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { useToasts } from './Toast.jsx';
import { downloadFile } from '../utils/download.js';
import { formatDate } from '../utils/prefs.js';
import { inr } from '../utils/receiptApi.js';

const HISTORY_LABELS = { approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended', reactivated: 'Reactivated', terminated: 'Terminated', restored: 'Restored', 'auto-reactivated': 'Reactivated automatically' };
const tomorrow = () => new Date(Date.now() + 330 * 60000 + 864e5).toISOString().slice(0, 10);

export default function UserDrawer({ userId, onClose, onChanged, onToast }) {
  const own = useToasts();
  const push = onToast || own.push;
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [dlg, setDlg] = useState(null);       // which dialog is open
  const [until, setUntil] = useState('');     // suspend date
  const [resetMode, setResetMode] = useState('link');
  const [temp, setTemp] = useState(null);     // temporary password, shown once
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setState((s) => (s === 'ready' ? s : 'loading'));
    return api.get(`/owner/users/${userId}`).then((r) => { setData(r.data); setNotes(r.data.user.ownerNotes || ''); setState('ready'); }).catch(() => setState('error'));
  }, [userId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !dlg) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dlg, onClose]);

  const refresh = async () => { await load(); onChanged?.(); };

  // run an action; a failed email never hides that the action itself worked
  const act = async (path, body, okText) => {
    const { data: r } = await api.post(`/owner/users/${userId}${path}`, body);
    push(r.emailSent === false ? `${okText} — but the email to the user could not be sent.` : okText, r.emailSent === false ? 'error' : 'ok');
    setDlg(null);
    await refresh();
    return r;
  };

  if (state === 'loading') {
    return (
      <div className="drawer-back" role="presentation"><aside className="drawer" aria-busy="true" aria-label="Loading user">
        <div className="sk-rows" style={{ padding: 20 }}>{[0, 1, 2, 3, 4].map((i) => <div className="sk-row" key={i}><div className="sk-line" style={{ width: `${60 - i * 6}%` }} /></div>)}</div>
      </aside></div>
    );
  }
  if (state === 'error') {
    return (
      <div className="drawer-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><aside className="drawer">
        <div style={{ padding: 20 }}><p className="error-text" role="alert">Could not load this user. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p><button type="button" className="btn-sm ghost" onClick={onClose}>Close</button></div>
      </aside></div>
    );
  }

  const { user, summary, history, logins, timeline } = data;
  const isOwner = user.role === 'owner';
  const name = user.businessName || user.fullName;
  const S = user.status;

  const startEdit = () => { setEditing(true); setErrors({}); setDraft({ fullName: user.fullName, email: user.email, phone: user.phone, businessName: user.businessName }); };
  const saveEdit = async () => {
    setBusy(true); setErrors({});
    try {
      const { data: r } = await api.put(`/owner/users/${userId}`, draft);
      push(r.changed.length ? 'Details saved' : 'Nothing changed'); setEditing(false); await refresh();
    } catch (err) { setErrors(err.response?.data?.errors || {}); push(err.response?.data?.message || 'Could not save.', 'error'); } finally { setBusy(false); }
  };
  const saveNotes = async () => {
    setBusy(true);
    try { await api.put(`/owner/users/${userId}`, { ownerNotes: notes }); push('Notes saved'); await refresh(); } catch (err) { push(err.response?.data?.message || 'Could not save the notes.', 'error'); } finally { setBusy(false); }
  };
  const quick = async (path, body, okText) => {
    setBusy(true);
    try { const { data: r } = await api.post(`/owner/users/${userId}${path}`, body); push(r.message || okText); await refresh(); } catch (err) { push(err.response?.data?.message || 'Could not do that.', 'error'); } finally { setBusy(false); }
  };
  const exportData = async () => { try { await downloadFile(`/owner/users/${userId}/export`, {}, 'user-data.json'); push('Data downloaded'); } catch { push('Could not export. Try again.', 'error'); } };

  const input = (k, label, type = 'text') => (
    <div className={`tool-field${errors[k] ? ' has-err' : ''}`} key={k}>
      <label htmlFor={`ud-${k}`}>{label}</label>
      <input id={`ud-${k}`} type={type} value={draft[k] ?? ''} onChange={(e) => { setDraft({ ...draft, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: undefined })); }} aria-invalid={!!errors[k]} />
      {errors[k] && <em role="alert">{errors[k]}</em>}
    </div>
  );

  return (
    <div className="drawer-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !dlg) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`User ${name}`}>
        <header className="drawer-head">
          <Avatar name={user.fullName} src={user.avatarUrl} size={52} />
          <div className="drawer-title">
            <h2>{name}</h2>
            <div className="muted">{user.fullName !== name ? `${user.fullName} · ` : ''}{user.email}</div>
            <div className="drawer-badges"><StatusBadge status={S} />{isOwner && <span className="us-status owner">Owner</span>}{!user.emailVerified && !isOwner && <span className="us-status pending">Email not verified</span>}</div>
          </div>
          <button type="button" className="btn-sm ghost" onClick={onClose}>Close</button>
        </header>

        <div className="drawer-body">
          {S === 'suspended' && <p className="drawer-note warn">Suspended{user.suspendedUntil ? ` until ${formatDate(user.suspendedUntil)}` : ''}{user.statusReason ? ` — ${user.statusReason}` : ''}.</p>}
          {S === 'terminated' && <p className="drawer-note danger">Terminated{user.statusReason ? ` — ${user.statusReason}` : ''}. They cannot sign in; their data is kept.</p>}
          {isOwner && <p className="drawer-note">Owner accounts cannot be suspended, terminated, reset or deleted from here.</p>}

          {/* ----- actions ----- */}
          {!isOwner && (
            <section className="drawer-sec">
              <h3>Access control</h3>
              <div className="drawer-actions">
                {S === 'pending' && <><button type="button" className="btn-sm primary" onClick={() => setDlg('approve')} disabled={!user.emailVerified}>Approve</button><button type="button" className="btn-sm reject" onClick={() => setDlg('reject')}>Reject</button></>}
                {S === 'active' && <><button type="button" className="btn-sm ghost" onClick={() => { setUntil(''); setDlg('suspend'); }}>Suspend</button><button type="button" className="btn-sm reject" onClick={() => setDlg('terminate')}>Terminate</button></>}
                {S === 'suspended' && <><button type="button" className="btn-sm primary" onClick={() => setDlg('reactivate')}>Reactivate</button><button type="button" className="btn-sm reject" onClick={() => setDlg('terminate')}>Terminate</button></>}
                {S === 'terminated' && <><button type="button" className="btn-sm primary" onClick={() => setDlg('restore')}>Restore</button><button type="button" className="btn-sm ghost" onClick={exportData}>Export their data</button><button type="button" className="btn-sm reject" onClick={() => setDlg('delete')}>Delete permanently…</button></>}
                {(S === 'active' || S === 'suspended') && <button type="button" className="btn-sm ghost" onClick={() => setDlg('forcelogout')}>Force logout</button>}
                {S !== 'terminated' && S !== 'rejected' && <button type="button" className="btn-sm ghost" onClick={() => { setResetMode('link'); setTemp(null); setDlg('reset'); }}>Reset password</button>}
                {!user.emailVerified && <button type="button" className="btn-sm ghost" onClick={() => quick('/resend-email', { kind: 'verification' }, 'Verification email sent')} disabled={busy}>Resend verification email</button>}
                {user.approvalStatus === 'approved' && S === 'active' && <button type="button" className="btn-sm ghost" onClick={() => quick('/resend-email', { kind: 'approval' }, 'Approval email sent')} disabled={busy}>Resend approval email</button>}
              </div>
            </section>
          )}

          {/* ----- details ----- */}
          <section className="drawer-sec">
            <div className="ma-head"><h3 style={{ margin: 0 }}>Details</h3>
              {!isOwner && !editing && <button type="button" className="btn-sm ghost" onClick={startEdit}>Edit</button>}
              {editing && <div><button type="button" className="btn-sm ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button><button type="button" className="btn-sm primary" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>}
            </div>
            {editing ? (
              <div className="tool-grid">{input('fullName', 'Name')}{input('email', 'Email', 'email')}{input('phone', 'Phone', 'tel')}{input('businessName', 'Business name')}</div>
            ) : (
              <dl className="ma-dl">
                {[['Name', user.fullName], ['Email', user.email], ['Phone', user.phone], ['Business', user.businessName], ['Business type', user.businessType], ['Client ID', user.clientId], ['Signed up', formatDate(user.createdAt, { time: true })], ['Last login', user.lastLoginAt ? formatDate(user.lastLoginAt, { time: true }) : '']].map(([k, v]) => (
                  <div className="ma-row" key={k}><dt>{k}</dt><dd>{v || <span className="muted">—</span>}</dd></div>
                ))}
              </dl>
            )}
            {editing && <p className="muted ma-hint">Changing the email signs the user out everywhere.</p>}
          </section>

          {!isOwner && (
            <section className="drawer-sec">
              <h3>Private notes <span className="us-private">only you can see this</span></h3>
              <textarea className="rc-textarea" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Private notes about this client" placeholder="e.g. Pays late. Prefers WhatsApp." />
              <div style={{ marginTop: 8 }}><button type="button" className="btn-sm ghost" onClick={saveNotes} disabled={busy || notes === (user.ownerNotes || '')}>Save notes</button></div>
            </section>
          )}

          {/* ----- summary ----- */}
          {!isOwner && (
            <section className="drawer-sec">
              <h3>Work &amp; payments</h3>
              <div className="rc-mini-stats">
                <div><span>Projects</span><strong>{summary.projects.length}</strong></div>
                <div><span>Invoices</span><strong>{summary.invoices.count}</strong></div>
                <div><span>Paid</span><strong>₹{inr(summary.invoices.paid)}</strong></div>
                <div><span>Due</span><strong>₹{inr(summary.invoices.due)}</strong></div>
                <div><span>Receipts</span><strong>{summary.receipts.count}</strong></div>
                <div><span>Open tickets</span><strong>{summary.tickets.open}/{summary.tickets.total}</strong></div>
              </div>
              {summary.projects.length > 0 && <ul className="us-plain">{summary.projects.map((p) => <li key={p._id}><strong>{p.name}</strong> <span className="muted">· {p.planLabel || 'No plan'} · {p.stage}{p.totalCost ? ` · ₹${inr(p.totalCost)}` : ''}</span></li>)}</ul>}
            </section>
          )}

          <section className="drawer-sec">
            <h3>Status history</h3>
            {history.length === 0 ? <p className="muted">No status changes recorded.</p> : (
              <ul className="us-plain">{history.map((h, i) => (
                <li key={i}><strong>{HISTORY_LABELS[h.status] || h.status}</strong>{h.until ? <span className="muted"> until {formatDate(h.until)}</span> : null}{h.reason ? <span> — {h.reason}</span> : null}
                  <div className="muted">{formatDate(h.at, { time: true })}{h.byName ? ` · by ${h.byName}` : ''}</div></li>
              ))}</ul>
            )}
          </section>

          <section className="drawer-sec">
            <h3>Login history</h3>
            {logins.length === 0 ? <p className="muted">No sign-ins recorded yet.</p> : (
              <ul className="ma-sessions">{logins.map((l) => (
                <li key={l.id}><div><strong>{l.device}</strong><span className="muted"> · {l.ip || 'IP unknown'}</span></div><div className="muted">{formatDate(l.at, { time: true })}</div><div><span className={`tag ${l.active ? 'open' : 'closed'}`}>{l.active ? 'Active' : 'Ended'}</span></div></li>
              ))}</ul>
            )}
          </section>

          <section className="drawer-sec">
            <h3>Activity timeline</h3>
            {timeline.length === 0 ? <p className="muted">Nothing yet.</p> : (
              <ul className="us-plain">{timeline.map((t, i) => (
                <li key={i}>{t.text}<div className="muted">{formatDate(t.at, { time: true })}{t.kind === 'owner' ? ` · owner action${t.by ? ` by ${t.by}` : ''}` : ''}</div></li>
              ))}</ul>
            )}
          </section>
        </div>

        {/* ----- confirmation dialogs ----- */}
        {dlg === 'approve' && <ConfirmDialog title={`Approve ${name}?`} confirmLabel="Approve" onClose={() => setDlg(null)} onConfirm={() => act('/approve', {}, `${name} approved`)}><p className="muted">They receive a client ID and an email, and can sign in.</p></ConfirmDialog>}
        {dlg === 'reject' && <ConfirmDialog title={`Reject ${name}?`} confirmLabel="Reject" danger reason reasonHint="Shown to them in the email" onClose={() => setDlg(null)} onConfirm={({ reason }) => act('/reject', { reason }, `${name} rejected`)}><p className="muted">They are emailed that access was not granted.</p></ConfirmDialog>}
        {dlg === 'suspend' && (
          <ConfirmDialog title={`Suspend ${name}?`} confirmLabel="Suspend" danger reason reasonHint="Included in the email to them" onClose={() => setDlg(null)} onConfirm={({ reason }) => act('/suspend', { reason, until: until || undefined }, `${name} suspended`)}>
            <p className="muted">They are signed out of every device immediately and cannot sign in until you reactivate them.</p>
            <div className="tool-field"><label htmlFor="sus-until">Reactivate automatically on (optional)</label><input id="sus-until" type="date" min={tomorrow()} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
          </ConfirmDialog>
        )}
        {dlg === 'reactivate' && <ConfirmDialog title={`Reactivate ${name}?`} confirmLabel="Reactivate" onClose={() => setDlg(null)} onConfirm={() => act('/reactivate', {}, `${name} reactivated`)}><p className="muted">They can sign in again (they will need to sign in fresh) and are emailed.</p></ConfirmDialog>}
        {dlg === 'terminate' && (
          <ConfirmDialog title={`Terminate ${name}?`} confirmLabel="Terminate account" danger reason reasonRequired reasonHint="Required — included in the email to them" typeToConfirm={user.email} typeLabel="Type their email address to confirm" onClose={() => setDlg(null)}
            onConfirm={({ reason }) => act('/terminate', { reason, confirmEmail: user.email }, `${name} terminated`)}>
            <p className="muted">They can no longer sign in and every session ends now. Their projects, invoices and files are <strong>kept</strong>, and you can restore the account later.</p>
          </ConfirmDialog>
        )}
        {dlg === 'restore' && <ConfirmDialog title={`Restore ${name}?`} confirmLabel="Restore" onClose={() => setDlg(null)} onConfirm={() => act('/restore', {}, `${name} restored`)}><p className="muted">The account becomes active again with all its data.</p></ConfirmDialog>}
        {dlg === 'forcelogout' && <ConfirmDialog title={`Sign ${name} out everywhere?`} confirmLabel="Force logout" danger onClose={() => setDlg(null)} onConfirm={() => act('/force-logout', {}, `${name} was signed out of every device`)}><p className="muted">Every browser and phone they are signed in on stops working immediately. They can sign in again.</p></ConfirmDialog>}
        {dlg === 'reset' && (
          temp ? (
            <div className="rc-modal-back"><div className="rc-modal rc-small cd-dialog" role="alertdialog" aria-modal="true" aria-label="Temporary password">
              <h3 className="section-title" style={{ marginTop: 0 }}>Temporary password</h3>
              <p className="muted">Shown <strong>once</strong>. Copy it now and share it securely. All their sessions were ended.</p>
              <div className="us-temp" data-testid="temp-password">{temp}</div>
              <div className="rc-actions"><button type="button" className="btn-sm ghost" onClick={() => { navigator.clipboard?.writeText(temp); push('Copied'); }}>Copy</button><button type="button" className="btn-sm primary" onClick={() => { setTemp(null); setDlg(null); }}>Done</button></div>
            </div></div>
          ) : (
            <ConfirmDialog title={`Reset password for ${name}`} confirmLabel={resetMode === 'link' ? 'Email reset link' : 'Generate password'} onClose={() => setDlg(null)}
              onConfirm={async () => { const { data: r } = await api.post(`/owner/users/${userId}/reset-password`, { mode: resetMode }); if (r.temporaryPassword) { setTemp(r.temporaryPassword); await refresh(); } else { push(r.message); setDlg(null); await refresh(); } }}>
              <div className="cd-choice">
                <label><input type="radio" name="rm" checked={resetMode === 'link'} onChange={() => setResetMode('link')} /> <span><strong>Email a reset link</strong><br /><span className="muted">They choose their own new password.</span></span></label>
                <label><input type="radio" name="rm" checked={resetMode === 'temp'} onChange={() => setResetMode('temp')} /> <span><strong>Generate a temporary password</strong><br /><span className="muted">Shown to you once; their current password stops working and all sessions end.</span></span></label>
              </div>
            </ConfirmDialog>
          )
        )}
        {dlg === 'delete' && (
          <ConfirmDialog title={`Permanently delete ${name}?`} confirmLabel="Delete permanently" danger typeToConfirm="DELETE" typeExact typeLabel="Type DELETE to confirm" onClose={() => setDlg(null)}
            onConfirm={async () => { const { data: r } = await api.delete(`/owner/users/${userId}`, { data: { confirm: 'DELETE' } }); push(r.message); setDlg(null); onChanged?.(); onClose(); }}>
            <p className="drawer-note danger" style={{ margin: '0 0 10px' }}>This cannot be undone.</p>
            <p className="muted">This removes the account and <strong>{summary.projects.length}</strong> project(s), <strong>{summary.invoices.count}</strong> invoice(s), <strong>{summary.receipts.count}</strong> receipt(s) and <strong>{summary.tickets.total}</strong> ticket(s). Uploaded files can no longer be reached from the portal. The audit log keeps a record that you deleted it.</p>
            <button type="button" className="btn-sm ghost" onClick={exportData}>Download their data first (JSON)</button>
          </ConfirmDialog>
        )}
        {!onToast && own.node}
      </aside>
    </div>
  );
}
