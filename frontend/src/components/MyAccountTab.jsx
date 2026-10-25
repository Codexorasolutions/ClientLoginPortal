// Owner dashboard → "My Account": the owner's own profile, business details, security, preferences and account summary.
// Each section is read-only until "Edit" is pressed; sensitive changes ask for the current password again.
import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios.js';
import Avatar from './Avatar.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { useToasts } from './Toast.jsx';
import { applyTheme } from '../utils/theme.js';
import { DATE_FORMATS, formatDate, getPrefs, setPrefs } from '../utils/prefs.js';
import { inr } from '../utils/receiptApi.js';

const SCORE_LABELS = ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'];
// same rule as the server: 8+ characters, a letter and a number
export function passwordStrength(pw = '') {
  const issues = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Za-z]/.test(pw)) issues.push('a letter');
  if (!/\d/.test(pw)) issues.push('a number');
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui)/i.test(pw)) score = Math.min(score, 1);
  return { ok: issues.length === 0, issues, score: pw ? Math.min(4, score) : 0 };
}

const storeUser = (patch) => {
  try { localStorage.setItem('cx_user', JSON.stringify({ ...JSON.parse(localStorage.getItem('cx_user') || '{}'), ...patch })); } catch { /* ignore */ }
};

function Skeleton() {
  return (
    <div className="tool-wrap" aria-busy="true" aria-label="Loading your account">
      <div className="stat-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div className="stat" key={i}><div className="sk-block sk-num" /><div className="sk-block sk-lab" /></div>)}</div>
      {[0, 1].map((i) => <div className="panel" key={i}><div className="sk-rows">{[0, 1, 2].map((j) => <div className="sk-row" key={j}><div className="sk-line" style={{ width: '30%' }} /><div className="sk-line" style={{ width: '50%' }} /></div>)}</div></div>)}
    </div>
  );
}

function Section({ title, icon, editing, saving, onEdit, onCancel, onSave, editable = true, children, extra }) {
  return (
    <section className="panel ma-section">
      <div className="ma-head">
        <h3 className="section-title" style={{ margin: 0 }}>{icon} {title}</h3>
        <div>
          {extra}
          {editable && !editing && <button type="button" className="btn-sm ghost" onClick={onEdit}>Edit</button>}
          {editing && (
            <>
              <button type="button" className="btn-sm ghost" onClick={onCancel} disabled={saving}>Cancel</button>
              <button type="button" className="btn-sm primary" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

const Row = ({ label, children }) => (
  <div className="ma-row"><dt>{label}</dt><dd>{children || <span className="muted">—</span>}</dd></div>
);

export default function MyAccountTab() {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [sessions, setSessions] = useState(null);
  const [editing, setEditing] = useState(null);  // 'profile' | 'business' | 'prefs'
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null);    // 'twofactor' | 'logoutall'
  const { push, node } = useToasts();
  const fileRef = useRef(null);
  const logoRef = useRef(null);

  const load = useCallback(() => {
    setState('loading');
    api.get('/owner/account')
      .then((r) => { setData(r.data); setPrefs({ dateFormat: r.data.preferences.dateFormat }); setState('ready'); })
      .catch(() => setState('error'));
    api.get('/owner/account/sessions').then((r) => setSessions(r.data)).catch(() => setSessions({ sessions: [], activeCount: 0, failed: true }));
  }, []);
  useEffect(load, [load]);

  const startEdit = (section, values) => { setEditing(section); setDraft(values); setErrors({}); };
  const cancel = () => { setEditing(null); setErrors({}); };
  const setD = (k) => (e) => { setDraft((d) => ({ ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); setErrors((x) => { const n = { ...x }; delete n[k]; return n; }); };

  const save = async (url, body, after) => {
    setSaving(true); setErrors({});
    try {
      const { data: res } = await api.put(url, body);
      after(res);
      setEditing(null);
      push('Saved');
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      push(err.response?.data?.message || 'Could not save. Check your connection and try again.', 'error');
    } finally { setSaving(false); }
  };

  const upload = async (url, field, file, onDone) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return push('That image is larger than 2 MB.', 'error');
    const form = new FormData(); form.append(field, file);
    try { const { data: res } = await api.post(url, form); onDone(res); push('Image updated'); } catch (err) { push(err.response?.data?.message || 'Upload failed. Try again.', 'error'); }
  };

  if (state === 'loading' && !data) return <Skeleton />;
  if (state === 'error' && !data) {
    return <div className="panel"><p className="error-text" role="alert" style={{ margin: 0 }}>Could not load your account. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p></div>;
  }
  const { profile, business, security, preferences, summary } = data;

  // a render function, not a component, so inputs keep focus while typing
  const input = (k, label, o = {}) => (
    <div className={`tool-field${errors[k] ? ' has-err' : ''}`} key={k}>
      <label htmlFor={`ma-${k}`}>{label}</label>
      {o.area ? <textarea id={`ma-${k}`} rows={o.area} value={draft[k] ?? ''} maxLength={o.max} onChange={setD(k)} aria-invalid={!!errors[k]} />
        : <input id={`ma-${k}`} type={o.type || 'text'} value={draft[k] ?? ''} maxLength={o.max} onChange={setD(k)} placeholder={o.placeholder} aria-invalid={!!errors[k]} />}
      {errors[k] && <em role="alert">{errors[k]}</em>}
    </div>
  );

  return (
    <div className="tool-wrap ma-wrap">
      {/* ---- account summary ---- */}
      <div className="stat-grid">
        {[['👥', summary.totalClients, 'Total clients'], ['✅', summary.activeClients, 'Active clients'], ['🛠️', summary.projects, 'Projects'], ['🧾', summary.invoices, 'Invoices'], ['💰', `₹${inr(summary.revenueCollected)}`, 'Revenue collected'], ['📅', formatDate(summary.memberSince), 'Member since']].map(([icon, value, label]) => (
          <div className="stat" key={label}><div className="stat-icon">{icon}</div><div className="num ma-num">{value}</div><div className="lab">{label}</div></div>
        ))}
      </div>

      {/* ---- profile ---- */}
      <Section
        title="Profile" icon="👤" editing={editing === 'profile'} saving={saving}
        onEdit={() => startEdit('profile', { fullName: profile.fullName, phone: profile.phone, designation: profile.designation })}
        onCancel={cancel}
        onSave={() => save('/owner/account/profile', draft, (r) => { setData((d) => ({ ...d, profile: r.profile })); storeUser({ fullName: r.profile.fullName }); })}
      >
        <div className="ma-profile">
          <div className="ma-photo">
            <Avatar name={profile.fullName} src={profile.avatarUrl} size={84} />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Choose profile photo"
              onChange={(e) => { upload('/owner/account/avatar', 'avatar', e.target.files[0], (r) => setData((d) => ({ ...d, profile: { ...d.profile, avatarUrl: r.avatarUrl } }))); e.target.value = ''; }} />
            <div>
              <button type="button" className="btn-sm ghost" onClick={() => fileRef.current?.click()}>{profile.avatarUrl ? 'Change photo' : 'Upload photo'}</button>
              {profile.avatarUrl && (
                <button type="button" className="btn-sm ghost" onClick={async () => { try { await api.delete('/owner/account/avatar'); setData((d) => ({ ...d, profile: { ...d.profile, avatarUrl: '' } })); push('Photo removed'); } catch { push('Could not remove the photo.', 'error'); } }}>Remove</button>
              )}
              <p className="muted ma-hint">JPG, PNG or WebP, up to 2 MB.</p>
            </div>
          </div>
          {editing === 'profile' ? (
            <div className="tool-grid">
              {input('fullName', 'Full name', { max: 80 })}
              {input('phone', 'Phone', { type: 'tel', max: 20 })}
              {input('designation', 'Designation', { max: 60, placeholder: 'e.g. Founder' })}
              <div className="tool-field"><label htmlFor="ma-email-ro">Email</label><input id="ma-email-ro" value={profile.email} disabled /><span className="muted ma-hint">Change it under Security.</span></div>
            </div>
          ) : (
            <dl className="ma-dl">
              <Row label="Name">{profile.fullName}</Row><Row label="Email">{profile.email}</Row><Row label="Phone">{profile.phone}</Row><Row label="Designation">{profile.designation}</Row>
              <Row label="Last sign-in">{profile.lastLoginAt ? formatDate(profile.lastLoginAt, { time: true }) : ''}</Row>
            </dl>
          )}
        </div>
      </Section>

      {/* ---- business ---- */}
      <Section
        title="Business details" icon="🏢" editing={editing === 'business'} saving={saving}
        onEdit={() => startEdit('business', { name: business.name, address: business.address, gstin: business.gstin, pan: business.pan, website: business.website, upiId: business.upiId, bankDetails: business.bankDetails, receiptNote: business.receiptNote })}
        onCancel={cancel}
        onSave={() => save('/owner/account/business', draft, (r) => setData((d) => ({ ...d, business: r.business })))}
      >
        <p className="muted ma-hint" style={{ marginTop: 0 }}>Shared with Settings and printed on receipts and invoice PDFs — change it in either place.</p>
        <div className="ma-logo">
          {business.logoUrl ? <img src={business.logoUrl} alt="Business logo" className="ma-logo-img" referrerPolicy="no-referrer" /> : <span className="muted">No logo uploaded</span>}
          <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Choose business logo"
            onChange={(e) => { upload('/owner/account/business/logo', 'logo', e.target.files[0], (r) => setData((d) => ({ ...d, business: r.business }))); e.target.value = ''; }} />
          <button type="button" className="btn-sm ghost" onClick={() => logoRef.current?.click()}>{business.logoUrl ? 'Change logo' : 'Upload logo'}</button>
          {business.logoUrl && <button type="button" className="btn-sm ghost" onClick={async () => { try { const { data: r } = await api.delete('/owner/account/business/logo'); setData((d) => ({ ...d, business: r.business })); push('Logo removed'); } catch { push('Could not remove the logo.', 'error'); } }}>Remove</button>}
        </div>
        {editing === 'business' ? (
          <div className="tool-grid">
            {input('name', 'Business name', { max: 80 })}
            {input('website', 'Website', { max: 120 })}
            {input('address', 'Address', { max: 160 })}
            {input('gstin', 'GSTIN (blank if not registered)', { max: 15 })}
            {input('pan', 'PAN (optional)', { max: 10 })}
            {input('upiId', 'UPI ID (shown on receipts)', { max: 60, placeholder: 'name@bank' })}
            <div style={{ gridColumn: '1 / -1' }}>{input('bankDetails', 'Bank details (shown on receipts)', { area: 2, max: 200, placeholder: 'Bank · account name · IFSC' })}</div>
            <div style={{ gridColumn: '1 / -1' }}>{input('receiptNote', 'Default receipt note', { area: 2, max: 300 })}</div>
          </div>
        ) : (
          <dl className="ma-dl">
            <Row label="Business name">{business.name}</Row><Row label="Website">{business.website}</Row><Row label="Address">{business.address}</Row>
            <Row label="GSTIN">{business.gstin}</Row><Row label="PAN">{business.pan}</Row><Row label="UPI ID">{business.upiId}</Row>
            <Row label="Bank details">{business.bankDetails}</Row><Row label="Default receipt note">{business.receiptNote}</Row>
          </dl>
        )}
      </Section>

      {/* ---- security ---- */}
      <section className="panel ma-section">
        <h3 className="section-title" style={{ marginTop: 0 }}>🔒 Security</h3>
        <PasswordForm onDone={(token) => { localStorage.setItem('cx_token', token); push('Password changed. Other devices were signed out.'); load(); }} onError={(m) => push(m, 'error')} />
        <hr className="ma-hr" />
        <EmailForm email={profile.email} onDone={(email) => { setData((d) => ({ ...d, profile: { ...d.profile, email } })); storeUser({ email }); push('Email address updated'); }} onError={(m) => push(m, 'error')} />
        <hr className="ma-hr" />
        <div className="ma-twofa">
          <div>
            <strong>Two-factor login (email code)</strong>
            <p className="muted ma-hint" style={{ margin: '4px 0 0' }}>
              {security.twoFactorForcedOff ? 'Switched off for the whole server (OWNER_2FA=off). Remove that setting to use this.' : security.twoFactorEnabled ? 'On — after your password you must enter a 6-digit code sent to your email.' : 'Off — your password alone signs you in. Turning this on is strongly recommended.'}
            </p>
          </div>
          <button type="button" role="switch" aria-checked={security.twoFactorEnabled} className={`ma-switch${security.twoFactorEnabled ? ' on' : ''}`} onClick={() => setDialog('twofactor')} disabled={security.twoFactorForcedOff}>
            <span className="ma-knob" /><span className="sr-only">Two-factor login</span>
          </button>
        </div>
        <hr className="ma-hr" />
        <div className="ma-head">
          <div><strong>Login history &amp; active sessions</strong><p className="muted ma-hint" style={{ margin: '4px 0 0' }}>Your last 20 sign-ins. Sessions stay active until they expire or you sign out everywhere.</p></div>
          <button type="button" className="btn-sm reject" onClick={() => setDialog('logoutall')}>Log out of all devices</button>
        </div>
        {!sessions ? <div className="sk-rows" style={{ marginTop: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="sk-row"><div className="sk-line" style={{ width: '70%' }} /></div>)}</div>
          : sessions.failed ? <p className="error-text">Could not load sign-in history. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p>
          : sessions.sessions.length === 0 ? <p className="muted">No sign-ins recorded yet.</p>
          : (
            <ul className="ma-sessions">
              {sessions.sessions.map((s) => (
                <li key={s.id}>
                  <div><strong>{s.device}</strong><span className="muted"> · {s.ip || 'IP unknown'}</span></div>
                  <div className="muted">{formatDate(s.at, { time: true })}</div>
                  <div>{s.current && <span className="tag paid">This device</span>} <span className={`tag ${s.active ? 'open' : 'closed'}`}>{s.active ? 'Active' : 'Signed out / expired'}</span></div>
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* ---- preferences ---- */}
      <Section
        title="Preferences" icon="⚙️" editing={editing === 'prefs'} saving={saving}
        onEdit={() => startEdit('prefs', { theme: preferences.theme, dateFormat: preferences.dateFormat, notificationsEnabled: preferences.notificationsEnabled, ...Object.fromEntries(Object.entries(preferences.notifyTypes).map(([k, v]) => [`n_${k}`, v])) })}
        onCancel={cancel}
        onSave={() => save('/owner/account/preferences', {
          theme: draft.theme, dateFormat: draft.dateFormat, notificationsEnabled: draft.notificationsEnabled,
          notifyTypes: { ticket: draft.n_ticket, lead: draft.n_lead, approval: draft.n_approval },
        }, (r) => { setData((d) => ({ ...d, preferences: r.preferences })); applyTheme(r.preferences.theme); setPrefs({ dateFormat: r.preferences.dateFormat }); })}
      >
        {editing === 'prefs' ? (
          <div className="tool-grid">
            <div className="tool-field"><label htmlFor="ma-theme">Theme</label><select id="ma-theme" value={draft.theme} onChange={setD('theme')}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
            <div className="tool-field"><label htmlFor="ma-df">Date format</label><select id="ma-df" value={draft.dateFormat} onChange={setD('dateFormat')}>{DATE_FORMATS.map((f) => <option key={f}>{f}</option>)}</select></div>
            <div className="ma-checks" style={{ gridColumn: '1 / -1' }}>
              <label><input type="checkbox" checked={draft.notificationsEnabled} onChange={setD('notificationsEnabled')} /> Show notifications (the bell)</label>
              {[['n_ticket', 'New support tickets and replies'], ['n_lead', 'New website leads'], ['n_approval', 'New signup requests']].map(([k, l]) => (
                <label key={k} className={draft.notificationsEnabled ? '' : 'dim'}><input type="checkbox" disabled={!draft.notificationsEnabled} checked={draft[k]} onChange={setD(k)} /> {l}</label>
              ))}
            </div>
          </div>
        ) : (
          <dl className="ma-dl">
            <Row label="Theme">{preferences.theme[0].toUpperCase() + preferences.theme.slice(1)}</Row>
            <Row label="Date format">{preferences.dateFormat} <span className="muted">(e.g. {formatDate(new Date(), { format: preferences.dateFormat })})</span></Row>
            <Row label="Notifications">{preferences.notificationsEnabled ? ['ticket', 'lead', 'approval'].filter((k) => preferences.notifyTypes[k]).map((k) => ({ ticket: 'Tickets', lead: 'Leads', approval: 'Signup requests' }[k])).join(', ') || 'All muted' : 'Off'}</Row>
          </dl>
        )}
      </Section>

      {dialog === 'twofactor' && (
        <ConfirmDialog
          title={security.twoFactorEnabled ? 'Turn off two-factor login?' : 'Turn on two-factor login?'}
          confirmLabel={security.twoFactorEnabled ? 'Turn off' : 'Turn on'} danger={security.twoFactorEnabled} password onClose={() => setDialog(null)}
          onConfirm={async ({ password }) => { const { data: r } = await api.put('/owner/account/two-factor', { enabled: !security.twoFactorEnabled, currentPassword: password }); setData((d) => ({ ...d, security: { ...d.security, twoFactorEnabled: r.twoFactorEnabled } })); setDialog(null); push(`Two-factor login is now ${r.twoFactorEnabled ? 'on' : 'off'}`); }}
        >
          <p className="muted">{security.twoFactorEnabled ? 'Anyone who learns your password will be able to sign in as the owner. Confirm with your password.' : 'From the next sign-in you will enter a 6-digit code emailed to you. Confirm with your password.'}</p>
        </ConfirmDialog>
      )}
      {dialog === 'logoutall' && (
        <ConfirmDialog
          title="Log out of all devices?" confirmLabel="Log out everywhere" danger password onClose={() => setDialog(null)}
          onConfirm={async ({ password }) => { await api.post('/owner/account/logout-all', { currentPassword: password }); localStorage.removeItem('cx_token'); localStorage.removeItem('cx_user'); sessionStorage.setItem('cx_logout_reason', 'You signed out of all devices. Please sign in again.'); window.location.assign('/login'); }}
        >
          <p className="muted">Every browser and phone signed in as the owner — including this one — is signed out immediately.</p>
        </ConfirmDialog>
      )}
      {node}
    </div>
  );
}

// ---------------- password ----------------
function PasswordForm({ onDone, onError }) {
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const s = passwordStrength(f.newPassword);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: undefined })); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try {
      const { data } = await api.put('/owner/account/password', f);
      setF({ currentPassword: '', newPassword: '', confirmPassword: '' }); setOpen(false); onDone(data.token);
    } catch (err) {
      const d = err.response?.data;
      setErrors({ ...(d?.errors || {}), ...(d?.code === 'wrong_password' || d?.code === 'password_required' || d?.code === 'too_many_attempts' ? { currentPassword: d.message } : {}) });
      if (!d?.errors && !d?.code) onError('Could not change the password. Try again.');
    } finally { setBusy(false); }
  };
  const field = (k, label, ac) => (
    <div className={`tool-field${errors[k] ? ' has-err' : ''}`}>
      <label htmlFor={`pw-${k}`}>{label}</label>
      <input id={`pw-${k}`} type="password" autoComplete={ac} value={f[k]} onChange={set(k)} aria-invalid={!!errors[k]} />
      {errors[k] && <em role="alert">{errors[k]}</em>}
    </div>
  );
  return (
    <div>
      <div className="ma-head"><div><strong>Password</strong><p className="muted ma-hint" style={{ margin: '4px 0 0' }}>Changing it signs out every other device.</p></div>
        {!open && <button type="button" className="btn-sm ghost" onClick={() => setOpen(true)}>Change password</button>}</div>
      {open && (
        <form onSubmit={submit} className="ma-pwform" noValidate>
          {field('currentPassword', 'Current password', 'current-password')}
          {field('newPassword', 'New password', 'new-password')}
          <div className="ma-meter" aria-live="polite">
            <div className="ma-bars">{[0, 1, 2, 3].map((i) => <span key={i} className={i < s.score ? `on s${s.score}` : ''} />)}</div>
            <span>{f.newPassword ? SCORE_LABELS[s.score] : 'Use 8+ characters with a letter and a number'}</span>
          </div>
          {field('confirmPassword', 'Confirm new password', 'new-password')}
          <div className="tool-row"><button type="button" className="btn-sm ghost" onClick={() => { setOpen(false); setErrors({}); }}>Cancel</button>
            <button type="submit" className="btn-sm primary" disabled={busy || !f.currentPassword || !s.ok || f.newPassword !== f.confirmPassword}>{busy ? 'Saving…' : 'Update password'}</button></div>
        </form>
      )}
    </div>
  );
}

// ---------------- email (verified with a code sent to the NEW address) ----------------
function EmailForm({ email, onDone, onError }) {
  const [step, setStep] = useState('idle'); // idle | form | code
  const [f, setF] = useState({ newEmail: '', currentPassword: '', otp: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrors((x) => ({ ...x, [k]: undefined })); };
  const handle = (err) => {
    const d = err.response?.data;
    setErrors({ ...(d?.errors || {}), ...(d?.code === 'wrong_password' || d?.code === 'password_required' || d?.code === 'too_many_attempts' ? { currentPassword: d.message } : {}) });
    if (!d?.errors && !['wrong_password', 'password_required', 'too_many_attempts'].includes(d?.code)) onError(d?.message || 'Something went wrong. Try again.');
  };
  const request = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const { data } = await api.post('/owner/account/email/request-otp', { newEmail: f.newEmail, currentPassword: f.currentPassword }); setInfo(data.message); setStep('code'); } catch (err) { handle(err); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy(true); setErrors({});
    try { const { data } = await api.post('/owner/account/email/verify', { otp: f.otp }); setStep('idle'); setF({ newEmail: '', currentPassword: '', otp: '' }); onDone(data.email); } catch (err) { handle(err); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="ma-head"><div><strong>Email address</strong><p className="muted ma-hint" style={{ margin: '4px 0 0' }}>{email} — a changed address must be confirmed with a code sent to it.</p></div>
        {step === 'idle' && <button type="button" className="btn-sm ghost" onClick={() => setStep('form')}>Change email</button>}</div>
      {step === 'form' && (
        <form onSubmit={request} className="ma-pwform" noValidate>
          <div className={`tool-field${errors.newEmail ? ' has-err' : ''}`}><label htmlFor="em-new">New email address</label><input id="em-new" type="email" value={f.newEmail} onChange={set('newEmail')} aria-invalid={!!errors.newEmail} />{errors.newEmail && <em role="alert">{errors.newEmail}</em>}</div>
          <div className={`tool-field${errors.currentPassword ? ' has-err' : ''}`}><label htmlFor="em-pw">Current password</label><input id="em-pw" type="password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} />{errors.currentPassword && <em role="alert">{errors.currentPassword}</em>}</div>
          <div className="tool-row"><button type="button" className="btn-sm ghost" onClick={() => { setStep('idle'); setErrors({}); }}>Cancel</button><button type="submit" className="btn-sm primary" disabled={busy || !f.newEmail || !f.currentPassword}>{busy ? 'Sending…' : 'Send code'}</button></div>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verify} className="ma-pwform" noValidate>
          <p className="muted" style={{ margin: '0 0 8px' }}>{info}</p>
          <div className={`tool-field${errors.otp ? ' has-err' : ''}`}><label htmlFor="em-otp">6-digit code</label><input id="em-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={f.otp} onChange={(e) => { setF({ ...f, otp: e.target.value.replace(/\D/g, '').slice(0, 6) }); setErrors({}); }} aria-invalid={!!errors.otp} />{errors.otp && <em role="alert">{errors.otp}</em>}</div>
          <div className="tool-row"><button type="button" className="btn-sm ghost" onClick={() => { setStep('idle'); setErrors({}); }}>Cancel</button><button type="submit" className="btn-sm primary" disabled={busy || f.otp.length !== 6}>{busy ? 'Checking…' : 'Confirm new email'}</button></div>
        </form>
      )}
    </div>
  );
}
