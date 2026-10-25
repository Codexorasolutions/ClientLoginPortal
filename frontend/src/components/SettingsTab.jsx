// Owner dashboard → Settings. Edits business details, receipt text and the two client emails
// (account approved / request rejected) without touching code. Styles: styles/owner-tools.css + dashboard.css.
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios.js';

const SECTIONS = [
  { id: 'business', label: 'Business details' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'emails', label: 'Email templates' },
];
const TEMPLATE_LABELS = {
  approved: 'Account approved', rejected: 'Request rejected',
  suspended: 'Account suspended', reactivated: 'Account reactivated / restored', terminated: 'Account terminated',
};
const BUSINESS_FIELDS = [
  ['name', 'Business name', 'text'], ['tagline', 'Tagline (optional)', 'text'],
  ['email', 'Contact email', 'email'], ['phone', 'Phone', 'tel'], ['whatsapp', 'WhatsApp number', 'tel'],
  ['website', 'Website', 'text'], ['address', 'Address', 'text'],
  ['instagram', 'Instagram handle', 'text'], ['linkedin', 'LinkedIn name', 'text'],
  ['gstin', 'GSTIN (leave blank if not registered)', 'text'], ['pan', 'PAN (optional)', 'text'],
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const getIn = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

export default function SettingsTab() {
  const [saved, setSaved] = useState(null);       // last saved settings
  const [form, setForm] = useState(null);         // working copy
  const [defaults, setDefaults] = useState(null);
  const [vars, setVars] = useState({});
  const [section, setSection] = useState('business');
  const [tpl, setTpl] = useState('approved');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);         // { type: 'ok' | 'err', text }
  const bodyRef = useRef(null);

  useEffect(() => {
    api.get('/owner/settings')
      .then(({ data }) => { setSaved(data.settings); setForm(data.settings); setDefaults(data.defaults); setVars(data.templateVars); })
      .catch(() => setNote({ type: 'err', text: 'Could not load settings. Refresh and try again.' }));
  }, []);

  const dirty = useMemo(() => !!form && !!saved && !same(form, saved), [form, saved]);

  // warn before leaving the page with unsaved edits
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!form) {
    return <div className="panel tool-wrap">{note ? <p className="error-text" style={{ margin: 0 }}>{note.text}</p> : <p className="muted" style={{ margin: 0 }}>Loading settings…</p>}</div>;
  }

  const setPath = (path, value) => {
    const [group, ...rest] = path.split('.');
    setForm((f) => {
      if (group === 'emailTemplates') {
        const [key, part] = rest;
        return { ...f, emailTemplates: { ...f.emailTemplates, [key]: { ...f.emailTemplates[key], [part]: value } } };
      }
      return { ...f, [group]: { ...f[group], [rest[0]]: value } };
    });
    setErrors((e) => { const n = { ...e }; delete n[path]; return n; });
    setNote(null);
  };

  const save = async () => {
    setBusy(true); setNote(null);
    try {
      const { data } = await api.put('/owner/settings', form);
      setSaved(data.settings); setForm(data.settings); setErrors({});
      setNote({ type: 'ok', text: data.changed.length ? 'Settings saved' : 'Nothing to save — no changes made' });
    } catch (err) {
      setErrors(err.response?.data?.errors || {});
      setNote({ type: 'err', text: err.response?.data?.message || 'Could not save settings. Try again.' });
    } finally { setBusy(false); }
  };

  const discard = () => { setForm(saved); setErrors({}); setNote(null); };

  const sendTest = async () => {
    if (dirty) return setNote({ type: 'err', text: 'Save your changes first — the test email uses the saved template.' });
    try {
      const { data } = await api.post('/owner/settings/test-email', { template: tpl });
      setNote({ type: 'ok', text: data.message });
    } catch (err) { setNote({ type: 'err', text: err.response?.data?.message || 'Could not send the test email.' }); }
  };

  const insertVar = (name) => {
    const el = bodyRef.current;
    const text = `{{${name}}}`;
    const path = `emailTemplates.${tpl}.body`;
    const cur = getIn(form, path);
    if (!el) return setPath(path, cur + text);
    const { selectionStart: a, selectionEnd: b } = el;
    setPath(path, cur.slice(0, a) + text + cur.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); });
  };

  // a render function, NOT a component: an inner component is re-created on every render and would drop input focus
  const field = (path, label, { type = 'text', rows } = {}) => {
    const err = errors[path];
    const props = {
      id: path, value: getIn(form, path) ?? '', 'aria-invalid': !!err,
      onChange: (e) => setPath(path, e.target.value),
    };
    return (
      <div key={path} className={`tool-field${err ? ' has-err' : ''}`}>
        <label htmlFor={path}>{label}</label>
        {rows
          ? <textarea rows={rows} ref={path.endsWith('.body') ? bodyRef : undefined} {...props} />
          : <input type={type} {...props} />}
        {err && <em role="alert">{err}</em>}
      </div>
    );
  };

  return (
    <div className="tool-wrap">
      <nav className="tool-tabs" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </nav>

      <div className="panel">
        {section === 'business' && (
          <>
            <p className="muted tool-lead">These details appear on receipts, invoice PDFs and your client emails.</p>
            <div className="tool-grid">
              {BUSINESS_FIELDS.map(([k, label, type]) => field(`business.${k}`, label, { type }))}
            </div>
          </>
        )}

        {section === 'receipt' && (
          <>
            <p className="muted tool-lead">Your GSTIN or PAN from Business details is printed on every receipt.</p>
            {field('receipt.stampText', 'Verification stamp text')}
            {field('receipt.thankYou', 'Footer thank-you line')}
            {field('receipt.notes', 'Default notes (printed in the Notes box)', { rows: 3 })}
            <div className="tool-stamp" aria-hidden="true">
              <b>✓</b>
              <div><strong>{form.receipt.stampText || '—'}</strong><small>The verification ID and date are added automatically</small></div>
            </div>
          </>
        )}

        {section === 'emails' && (
          <>
            <p className="muted tool-lead">Wording of the emails clients receive. Sign-in codes and password-reset emails are fixed for security.</p>
            <div className="tool-field">
              <label htmlFor="tpl-pick">Template</label>
              <select id="tpl-pick" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                {Object.entries(TEMPLATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {field(`emailTemplates.${tpl}.subject`, 'Subject')}
            {field(`emailTemplates.${tpl}.body`, 'Message', { rows: 9 })}
            <div className="tool-chips">
              <span className="muted">Insert:</span>
              {(vars[tpl] || []).map((v) => <button key={v} type="button" className="tool-chip" onClick={() => insertVar(v)}>{`{{${v}}}`}</button>)}
            </div>
            <div className="tool-row">
              <button type="button" className="btn-sm ghost" onClick={sendTest}>Send test to my email</button>
              <button
                type="button" className="btn-sm ghost"
                onClick={() => ['subject', 'body'].forEach((p) => setPath(`emailTemplates.${tpl}.${p}`, defaults.emailTemplates[tpl][p]))}
              >Reset this template</button>
            </div>
          </>
        )}
      </div>

      <div className="tool-bar" role="region" aria-label="Save settings">
        <span className={`tool-note ${note?.type || ''}`} role="status">{note?.text || (dirty ? 'You have unsaved changes' : '')}</span>
        <button type="button" className="btn-sm ghost" onClick={discard} disabled={!dirty || busy}>Discard</button>
        <button type="button" className="btn-sm primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}
