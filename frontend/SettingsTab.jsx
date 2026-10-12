// SettingsTab.jsx — owner dashboard "Settings" tab.
// Assumes an axios instance at ../api with the JWT header already attached. Add: import './settings.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';

const SECTIONS = [
  { id: 'business', label: 'Business details' },
  { id: 'receipt', label: 'Receipts' },
  { id: 'emails', label: 'Email templates' },
];
const TEMPLATE_LABELS = {
  approved: 'Account approved',
  rejected: 'Request rejected',
  invoice: 'New invoice',
  ticketReply: 'Ticket reply',
};
const BUSINESS_FIELDS = [
  ['name', 'Business name', 'text'], ['tagline', 'Tagline (optional)', 'text'],
  ['email', 'Contact email', 'email'], ['phone', 'Phone', 'tel'], ['whatsapp', 'WhatsApp number', 'tel'],
  ['website', 'Website', 'text'], ['address', 'Address', 'text'],
  ['instagram', 'Instagram handle', 'text'], ['linkedin', 'LinkedIn name', 'text'],
  ['gstin', 'GSTIN (leave blank if not registered)', 'text'], ['pan', 'PAN (optional)', 'text'],
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function SettingsTab() {
  const [saved, setSaved] = useState(null);      // last saved settings
  const [form, setForm] = useState(null);        // working copy
  const [defaults, setDefaults] = useState(null);
  const [vars, setVars] = useState({});
  const [section, setSection] = useState('business');
  const [tpl, setTpl] = useState('approved');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);        // { type: 'ok' | 'err', text }
  const bodyRef = useRef(null);

  useEffect(() => {
    api.get('/owner/settings')
      .then(({ data }) => { setSaved(data.settings); setForm(data.settings); setDefaults(data.defaults); setVars(data.templateVars); })
      .catch(() => setNote({ type: 'err', text: 'Could not load settings. Refresh and try again.' }));
  }, []);

  const dirty = useMemo(() => form && saved && !same(form, saved), [form, saved]);

  // warn before leaving the page with unsaved edits
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!form) return <div className="st-wrap">{note ? <p className="st-note err">{note.text}</p> : <p className="st-muted">Loading settings…</p>}</div>;

  const setField = (group, key, value) => {
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));
    setErrors((e) => { const n = { ...e }; delete n[`${group}.${key}`]; return n; });
    setNote(null);
  };
  const setTemplate = (key, part, value) => {
    setForm((f) => ({ ...f, emailTemplates: { ...f.emailTemplates, [key]: { ...f.emailTemplates[key], [part]: value } } }));
    setErrors((e) => { const n = { ...e }; delete n[`emailTemplates.${key}.${part}`]; return n; });
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
    const cur = form.emailTemplates[tpl].body;
    if (!el) return setTemplate(tpl, 'body', cur + text);
    const { selectionStart: a, selectionEnd: b } = el;
    setTemplate(tpl, 'body', cur.slice(0, a) + text + cur.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); });
  };

  // a render function, NOT a component: an inner component is re-created each render and would drop input focus
  const field = ({ path, label, type = 'text', area }) => {
    const [group, ...rest] = path.split('.');
    const key = rest.join('.');
    const value = key.split('.').reduce((o, k) => o?.[k], form[group]) ?? '';
    const err = errors[path];
    const props = {
      id: path, value, 'aria-invalid': !!err,
      onChange: (e) => (group === 'emailTemplates'
        ? setTemplate(key.split('.')[0], key.split('.')[1], e.target.value)
        : setField(group, key, e.target.value)),
    };
    return (
      <label key={path} className={`st-field${err ? ' has-err' : ''}`} htmlFor={path}>
        <span>{label}</span>
        {area ? <textarea rows={area} {...props} /> : <input type={type} {...props} />}
        {err && <em>{err}</em>}
      </label>
    );
  };

  return (
    <div className="st-wrap">
      <nav className="st-tabs" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>{s.label}</button>
        ))}
      </nav>

      {section === 'business' && (
        <section className="st-card">
          <p className="st-muted">These details appear on receipts and in the footer of client emails.</p>
          <div className="st-grid">
            {BUSINESS_FIELDS.map(([k, label, type]) => field({ path: `business.${k}`, label, type }))}
          </div>
        </section>
      )}

      {section === 'receipt' && (
        <section className="st-card">
          <p className="st-muted">The GSTIN and PAN from Business details are printed on every receipt.</p>
          {field({ path: 'receipt.stampText', label: 'Verification stamp text' })}
          {field({ path: 'receipt.thankYou', label: 'Footer thank-you line' })}
          {field({ path: 'receipt.notes', label: 'Default notes (printed in the Notes box)', area: 3 })}
          <div className="st-stamp" aria-hidden="true"><b>✓</b><div><strong>{form.receipt.stampText || '—'}</strong><small>Verification ID and date are added automatically</small></div></div>
        </section>
      )}

      {section === 'emails' && (
        <section className="st-card">
          <div className="st-row">
            <label className="st-field">
              <span>Template</span>
              <select value={tpl} onChange={(e) => setTpl(e.target.value)}>
                {Object.entries(TEMPLATE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
          </div>
          {field({ path: `emailTemplates.${tpl}.subject`, label: 'Subject' })}
          {field({ path: `emailTemplates.${tpl}.body`, label: 'Message', area: 9 })}
          {/* ref is attached to the textarea after render */}
          <RefBinder bodyRef={bodyRef} id={`emailTemplates.${tpl}.body`} />
          <div className="st-chips">
            <span className="st-muted">Insert:</span>
            {(vars[tpl] || []).map((v) => <button key={v} type="button" onClick={() => insertVar(v)}>{`{{${v}}}`}</button>)}
          </div>
          <div className="st-row">
            <button type="button" className="st-ghost" onClick={sendTest}>Send test to my email</button>
            <button
              type="button" className="st-ghost"
              onClick={() => setForm((f) => ({ ...f, emailTemplates: { ...f.emailTemplates, [tpl]: defaults.emailTemplates[tpl] } }))}
            >Reset this template</button>
          </div>
        </section>
      )}

      <div className="st-bar" role="region" aria-label="Save settings">
        <span className={`st-note ${note?.type || ''}`} role="status">{note?.text || (dirty ? 'You have unsaved changes' : '')}</span>
        <button type="button" className="st-ghost" onClick={discard} disabled={!dirty || busy}>Discard</button>
        <button type="button" className="st-primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}

// Small helper: keeps bodyRef pointing at the current body <textarea> (it is re-created per template).
function RefBinder({ bodyRef, id }) {
  useEffect(() => { bodyRef.current = document.getElementById(id); });
  return null;
}
