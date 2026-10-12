// Pure logic (no database): defaults, validation and email-template rendering for the Settings page.

export const buildDefaults = () => ({
  business: {
    name: process.env.COMPANY_NAME || 'Codexora Solutions',
    tagline: '',
    email: process.env.COMPANY_EMAIL || 'CodexoraSolutions@gmail.com',
    phone: '+91 96288 02518',
    whatsapp: '+91 96288 02518',
    website: 'www.codexorasolutions.online',
    address: process.env.COMPANY_ADDRESS || 'Ballia, Uttar Pradesh, India',
    instagram: '@codexorasolutions',
    linkedin: 'codexorasolutions',
    gstin: '',
    pan: '',
  },
  receipt: {
    notes: '',
    thankYou: 'Thank you for choosing Codexora Solutions.',
    stampText: 'Digitally verified by Codexora',
  },
  // Only the emails the portal really sends are editable. OTP and password-reset emails are deliberately not.
  emailTemplates: {
    approved: {
      subject: "You're approved — {{businessName}} Portal access granted",
      body: 'Welcome to the {{businessName}} Portal!\n\nYour account for {{clientName}} has been approved.\nYour client ID: {{clientId}}\n\nYou can now sign in at {{portalUrl}} using your email and password.',
    },
    rejected: {
      subject: 'Update on your {{businessName}} Portal request',
      body: "We're unable to grant portal access for {{clientName}} at this time.\n\n{{reasonNote}}\n\nReply to this email if you have questions.\n\n{{businessName}}",
    },
  },
});

// placeholders each template may use — typos like {{clientNmae}} are rejected on save
export const TEMPLATE_VARS = {
  approved: ['clientName', 'businessName', 'clientId', 'portalUrl'],
  rejected: ['clientName', 'businessName', 'reasonNote'],
};

export const SAMPLE_VARS = {
  clientName: 'Shanti Public School', businessName: 'Codexora Solutions', clientId: 'CX-2026-014',
  portalUrl: 'https://portal.codexora.in', reasonNote: 'Note: We could not verify your business details.',
};

export const FIELDS = {
  'business.name': { t: 'text', max: 80, required: true },
  'business.tagline': { t: 'text', max: 120 },
  'business.email': { t: 'email', max: 120, required: true },
  'business.phone': { t: 'phone', max: 20 },
  'business.whatsapp': { t: 'phone', max: 20 },
  'business.website': { t: 'text', max: 120 },
  'business.address': { t: 'text', max: 160 },
  'business.instagram': { t: 'text', max: 60 },
  'business.linkedin': { t: 'text', max: 60 },
  'business.gstin': { t: 'gstin', max: 15 },
  'business.pan': { t: 'pan', max: 10 },
  'receipt.notes': { t: 'multiline', max: 300 },
  'receipt.thankYou': { t: 'text', max: 100 },
  'receipt.stampText': { t: 'text', max: 60, required: true },
};
for (const key of Object.keys(TEMPLATE_VARS)) {
  FIELDS[`emailTemplates.${key}.subject`] = { t: 'text', max: 150, required: true, vars: TEMPLATE_VARS[key] };
  FIELDS[`emailTemplates.${key}.body`] = { t: 'multiline', max: 3000, required: true, vars: TEMPLATE_VARS[key] };
}

const RX = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^[+\d][\d\s-]{6,18}$/,
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
};

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o, p, v) => {
  const ks = p.split('.');
  ks.slice(0, -1).reduce((a, k) => (a[k] = a[k] || {}), o)[ks[ks.length - 1]] = v;
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// defaults <- stored values (so fields added later still show up with their defaults)
export function mergeWithDefaults(stored = {}) {
  const out = buildDefaults();
  for (const p of Object.keys(FIELDS)) {
    const v = getPath(stored, p);
    if (typeof v === 'string') setPath(out, p, v);
  }
  return out;
}

// Validates only the whitelisted fields present in `input`; everything else keeps its `current` value.
export function sanitizeSettings(input = {}, current = buildDefaults()) {
  const data = clone(current);
  const errors = {};
  for (const [path, rule] of Object.entries(FIELDS)) {
    let v = getPath(input, path);
    if (v === undefined) continue;
    if (typeof v !== 'string') { errors[path] = 'Must be text'; continue; }
    v = rule.t === 'multiline' ? v.replace(/\r\n/g, '\n').trim() : v.replace(/\s+/g, ' ').trim();
    if (rule.t === 'gstin' || rule.t === 'pan') v = v.toUpperCase();
    if (rule.required && !v) { errors[path] = 'This field is required'; continue; }
    if (v.length > rule.max) { errors[path] = `Keep this under ${rule.max} characters`; continue; }
    if (v) {
      if (rule.t === 'email' && !RX.email.test(v)) { errors[path] = 'Enter a valid email address'; continue; }
      if (rule.t === 'phone' && !RX.phone.test(v)) { errors[path] = 'Enter a valid phone number'; continue; }
      if (rule.t === 'gstin' && !RX.gstin.test(v)) { errors[path] = 'GSTIN must be 15 characters, e.g. 09ABCDE1234F1Z5'; continue; }
      if (rule.t === 'pan' && !RX.pan.test(v)) { errors[path] = 'PAN must look like ABCDE1234F'; continue; }
    }
    if (rule.vars) {
      const bad = [...v.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((n) => !rule.vars.includes(n));
      if (bad.length) { errors[path] = `Unknown placeholder: ${[...new Set(bad)].map((b) => `{{${b}}}`).join(', ')}`; continue; }
    }
    setPath(data, path, v);
  }
  return { data, errors };
}

// changed field paths (recorded in the audit log — paths only, never the values)
export const diffPaths = (before, after) => Object.keys(FIELDS).filter((p) => getPath(before, p) !== getPath(after, p));

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = (str, vars, esc) =>
  str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : esc ? escapeHtml(vars[k]) : String(vars[k])));

export function renderTemplate(tpl, vars) {
  const tidy = (t) => t.replace(/\n{3,}/g, '\n\n').trim(); // an empty placeholder never leaves a gap of blank lines
  const subject = fill(tpl.subject, vars, false).replace(/[\r\n]+/g, ' ');
  const text = tidy(fill(tpl.body, vars, false));
  const html = tidy(escapeHtml(tpl.body).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] == null ? '' : escapeHtml(vars[k])))).replace(/\n/g, '<br>');
  return {
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;font-size:15px;line-height:1.6;color:#14161C">${html}</div>`,
    text,
  };
}
