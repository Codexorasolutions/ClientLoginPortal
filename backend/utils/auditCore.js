// utils/auditCore.js — pure logic (no DB): action catalog, redaction, entry building, query filters.
export const ACTIONS = {
  'auth.login':            { label: 'Owner signed in',        level: 'info' },
  'auth.login_failed':     { label: 'Failed owner sign-in',   level: 'danger' },
  'auth.2fa_failed':       { label: 'Wrong sign-in code',     level: 'danger' },
  'auth.2fa_locked':       { label: 'Sign-in locked',         level: 'danger' },
  'auth.password_changed': { label: 'Password changed',       level: 'warn' },
  'client.approve':        { label: 'Client approved',        level: 'info' },
  'client.reject':         { label: 'Client rejected',        level: 'danger' },
  'project.save':          { label: 'Project saved',          level: 'warn' },
  'invoice.create':        { label: 'Invoice created',        level: 'info' },
  'invoice.update':        { label: 'Invoice updated',        level: 'warn' },
  'invoice.mark_paid':     { label: 'Invoice marked paid',    level: 'info' },
  'receipt.generate':      { label: 'Receipt downloaded',     level: 'info' },
  'file.upload':           { label: 'File shared with client', level: 'info' },
  'ticket.reply':          { label: 'Ticket reply sent',      level: 'info' },
  'ticket.status':         { label: 'Ticket status changed',  level: 'warn' },
  'lead.update':           { label: 'Lead updated',           level: 'warn' },
  'settings.update':       { label: 'Settings changed',       level: 'warn' },
  'export.download':       { label: 'Data exported',          level: 'warn' },
};

const SENSITIVE_KEY = /pass(word)?|token|otp|secret|hash|authorization|cookie|card|cvv|aadhaar|pan$/i;
const MAX_STR = 300;
const MAX_JSON = 4000;

// deep-copy with secrets removed and sizes capped, so a log row can never leak a password or balloon
export function redact(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') return value.length > MAX_STR ? `${value.slice(0, MAX_STR)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth >= 4) return '[nested]';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : redact(v, depth + 1);
  return out;
}

const safeMeta = (meta) => {
  if (meta == null) return undefined;
  const r = redact(meta);
  return JSON.stringify(r).length > MAX_JSON ? { truncated: true } : r;
};

// [{ field, from, to }] for the given keys — values are redacted
export function diffObjects(before = {}, after = {}, keys = Object.keys(after)) {
  return keys
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, from: redact(SENSITIVE_KEY.test(k) ? '[redacted]' : before[k]), to: redact(SENSITIVE_KEY.test(k) ? '[redacted]' : after[k]) }));
}

// info: { entityType, entityId, entityLabel, summary, meta, actor? }  (actor override is for unauthenticated events)
export function buildEntry(req, action, info = {}) {
  const u = info.actor || req.user || {};
  const meta = ACTIONS[action];
  const label = info.entityLabel ? String(info.entityLabel).slice(0, 120) : undefined;
  return {
    actor: { id: u._id || u.id, name: u.fullName || u.name, email: u.email, role: u.role },
    action,
    entityType: info.entityType,
    entityId: info.entityId != null ? String(info.entityId) : undefined,
    entityLabel: label,
    summary: (info.summary || [meta?.label || action, label].filter(Boolean).join(': ')).slice(0, 300),
    meta: safeMeta(info.meta),
    ip: req.ip || req.headers?.['x-forwarded-for'],
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
  };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// query string -> mongo filter + paging
export function buildFilter(q = {}) {
  const filter = {};
  if (q.action) {
    const list = String(q.action).split(',').map((s) => s.trim()).filter((a) => ACTIONS[a]);
    if (list.length) filter.action = { $in: list };
  }
  if (q.actor && /^[a-f\d]{24}$/i.test(q.actor)) filter['actor.id'] = q.actor;
  if (q.entityType) filter.entityType = String(q.entityType).slice(0, 40);
  if (q.entityId) filter.entityId = String(q.entityId).slice(0, 60);
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if ((from && !isNaN(from)) || (to && !isNaN(to))) {
    filter.createdAt = {};
    if (from && !isNaN(from)) filter.createdAt.$gte = from;
    if (to && !isNaN(to)) { if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setUTCHours(23, 59, 59, 999); filter.createdAt.$lte = to; }
  }
  const text = String(q.q || '').trim().slice(0, 80);
  if (text) {
    const rx = new RegExp(escapeRegex(text), 'i');
    filter.$or = [{ summary: rx }, { entityLabel: rx }, { 'actor.name': rx }, { 'actor.email': rx }];
  }
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  return { filter, page, limit };
}


