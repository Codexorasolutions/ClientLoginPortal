// "Users" — the owner's control centre for every account that can sign in. All routes are owner-only
// (mounted behind protect + roleGuard('owner')). No response ever contains a password hash, OTP, reset token or token version.
import crypto from 'crypto';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';
import Receipt from '../models/Receipt.js';
import Deliverable from '../models/Deliverable.js';
import SupportTicket from '../models/SupportTicket.js';
import Activity from '../models/Activity.js';
import Notification from '../models/Notification.js';
import LoginEvent from '../models/LoginEvent.js';
import AuditLog from '../models/AuditLog.js';
import { logAudit } from '../utils/audit.js';
import { ACTIONS, buildFilter } from '../utils/auditCore.js';
import { toCsv, sendCsv } from '../utils/csv.js';
import { effectiveStatus, canManage, STATUS_LABELS, isEmail } from '../utils/userStatus.js';
import { describeDevice } from '../utils/ownerOtpCore.js';
import { sendVerificationOtp, sendResetLink } from '../utils/accountEmails.js';
import { renderEmail } from '../utils/settings.js';
import sendEmail from '../utils/sendEmail.js';
import {
  approveUser, rejectUser, suspendUser, reactivateUser, terminateUser, terminateUserConfirmed, restoreUser, forceLogoutUser, loadUser, fail,
} from '../utils/userActions.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const label = (u) => u.businessName || u.fullName;

const handle = (res, err, what = 'complete that action') => {
  if (err.status) return res.status(err.status).json({ message: err.message, code: err.code });
  console.error(`[users] could not ${what}:`, err);
  return res.status(500).json({ message: `Could not ${what}. Please try again.` });
};

// ---------- shape of a user in every response ----------
export const serialize = (u, extra = {}) => ({
  _id: u._id, fullName: u.fullName, email: u.email, phone: u.phone || '', businessName: u.businessName || '', businessType: u.businessType || '',
  role: u.role, clientId: u.clientId || '', avatarUrl: u.avatarUrl || '',
  status: effectiveStatus(u), accessStatus: u.accessStatus || 'active', approvalStatus: u.approvalStatus, emailVerified: !!u.isEmailVerified,
  createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null, suspendedUntil: u.suspendedUntil || null, statusReason: u.statusReason || '',
  ...extra,
});

// "status" filter values -> database conditions (same precedence as effectiveStatus)
const notBlocked = { accessStatus: { $nin: ['suspended', 'terminated'] } };
const STATUS_QUERY = {
  terminated: () => ({ accessStatus: 'terminated' }),
  suspended: () => ({ accessStatus: 'suspended' }),
  rejected: () => ({ ...notBlocked, role: 'client', approvalStatus: 'rejected' }),
  pending: () => ({ ...notBlocked, role: 'client', approvalStatus: 'pending' }),
  active: () => ({ ...notBlocked, $or: [{ role: 'owner' }, { role: 'client', approvalStatus: 'approved' }] }),
};

// suspensions that have run their course are lifted before any list is built
async function liftExpiredSuspensions() {
  await User.updateMany(
    { accessStatus: 'suspended', suspendedUntil: { $lte: new Date() } },
    { $set: { accessStatus: 'active' }, $unset: { suspendedUntil: 1, suspendedAt: 1, statusReason: 1 }, $push: { statusHistory: { status: 'auto-reactivated', reason: 'Suspension period ended', at: new Date() } } }
  );
}

function listFilter(query) {
  const and = [];
  if (STATUS_QUERY[query.status]) and.push(STATUS_QUERY[query.status]());
  const q = String(query.q || '').trim().slice(0, 80);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    and.push({ $or: [{ fullName: rx }, { email: rx }, { phone: rx }, { businessName: rx }, { clientId: rx }] });
  }
  return and.length ? { $and: and } : {};
}
const SORTS = { newest: { createdAt: -1 }, lastLogin: { lastLoginAt: -1, createdAt: -1 }, name: { fullName: 1 } };

async function statsFor() {
  const keys = ['active', 'pending', 'suspended', 'terminated', 'rejected'];
  const [total, ...counts] = await Promise.all([User.countDocuments({}), ...keys.map((k) => User.countDocuments(STATUS_QUERY[k]()))]);
  return { total, ...Object.fromEntries(keys.map((k, i) => [k, counts[i]])) };
}

// ---------- GET /users ----------
export const listUsers = async (req, res) => {
  try {
    await liftExpiredSuspensions();
    const filter = listFilter(req.query);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = SORTS[req.query.sort] || SORTS.newest;
    const [users, total, stats] = await Promise.all([
      User.find(filter).select('-password -otp -otpExpires -resetToken -resetTokenExpires').sort(sort).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
      statsFor(),
    ]);
    const projects = await Project.find({ client: { $in: users.map((u) => u._id) } }).select('client');
    const perUser = {};
    projects.forEach((p) => { perUser[String(p.client)] = (perUser[String(p.client)] || 0) + 1; });
    res.json({ items: users.map((u) => serialize(u, { projects: perUser[String(u._id)] || 0 })), total, page, pages: Math.max(1, Math.ceil(total / limit)), stats });
  } catch (err) { handle(res, err, 'load users'); }
};

// ---------- GET /users/export  (CSV of the current filter) ----------
export const exportUsersCsv = async (req, res) => {
  try {
    await liftExpiredSuspensions();
    const users = await User.find(listFilter(req.query)).select('-password -otp -otpExpires -resetToken -resetTokenExpires').sort(SORTS[req.query.sort] || SORTS.newest).limit(5000);
    const counts = {};
    (await Project.find({ client: { $in: users.map((u) => u._id) } }).select('client')).forEach((p) => { counts[String(p.client)] = (counts[String(p.client)] || 0) + 1; });
    const csv = toCsv(users, [
      { header: 'Name', value: (u) => u.fullName }, { header: 'Email', value: (u) => u.email }, { header: 'Phone', value: (u) => u.phone },
      { header: 'Business', value: (u) => u.businessName }, { header: 'Business type', value: (u) => u.businessType }, { header: 'Client ID', value: (u) => u.clientId },
      { header: 'Role', value: (u) => u.role }, { header: 'Status', value: (u) => STATUS_LABELS[effectiveStatus(u)] }, { header: 'Reason', value: (u) => u.statusReason },
      { header: 'Email verified', value: (u) => (u.isEmailVerified ? 'Yes' : 'No') }, { header: 'Signed up', value: (u) => u.createdAt }, { header: 'Last login', value: (u) => u.lastLoginAt },
      { header: 'Projects', value: (u) => counts[String(u._id)] || 0 },
    ]);
    await logAudit(req, 'user.export', { entityType: 'user', entityLabel: 'Users list', summary: `Exported ${users.length} users to CSV`, meta: { count: users.length, status: req.query.status || undefined } });
    sendCsv(res, `codexora-users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) { handle(res, err, 'export users'); }
};

// ---------- GET /users/:id ----------
async function summaryFor(userId) {
  const [projects, invoices, receipts, tickets] = await Promise.all([
    Project.find({ client: userId }).select('name planLabel stage totalCost'),
    Invoice.find({ client: userId }).select('amount status'),
    Receipt.find({ client: userId, voided: false }).select('amountReceived'),
    SupportTicket.find({ client: userId }).select('status'),
  ]);
  const sum = (arr, f) => Math.round(arr.reduce((s, x) => s + Math.round(f(x) * 100), 0)) / 100;
  return {
    projects: projects.map((p) => ({ _id: p._id, name: p.name, planLabel: p.planLabel, stage: p.stage, totalCost: p.totalCost || null })),
    invoices: { count: invoices.length, total: sum(invoices, (i) => i.amount), paid: sum(invoices.filter((i) => i.status === 'paid'), (i) => i.amount), due: sum(invoices.filter((i) => i.status !== 'paid'), (i) => i.amount) },
    receipts: { count: receipts.length, amount: sum(receipts, (r) => r.amountReceived) },
    tickets: { total: tickets.length, open: tickets.filter((t) => t.status === 'open').length },
  };
}

export const getUser = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const [summary, logins, activity, auditRows, historyUsers] = await Promise.all([
      summaryFor(user._id),
      LoginEvent.find({ user: user._id }).sort({ createdAt: -1 }).limit(20),
      Activity.find({ client: user._id }).sort({ createdAt: -1 }).limit(30),
      AuditLog.find({ entityId: String(user._id) }).sort({ createdAt: -1 }).limit(30),
      Promise.resolve(null),
    ]);
    const timeline = [
      ...activity.map((a) => ({ at: a.createdAt, kind: 'activity', text: a.message })),
      ...auditRows.map((a) => ({ at: a.createdAt, kind: 'owner', text: a.summary, by: a.actor?.name || a.actor?.email || '' })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50);
    const history = [...(user.statusHistory || [])].reverse().slice(0, 50).map((h) => ({ status: h.status, reason: h.reason || '', byName: h.byName || '', at: h.at, until: h.until || null }));
    const now = Date.now();
    res.json({
      user: serialize(user, { ownerNotes: user.ownerNotes || '', terminatedAt: user.terminatedAt || null, suspendedAt: user.suspendedAt || null }),
      summary, history, timeline,
      logins: logins.map((e) => ({ id: e._id, at: e.createdAt, ip: e.ip || '', device: describeDevice(e.userAgent), active: (e.tokenVersion || 0) === (user.tokenVersion || 0) && (!e.expiresAt || e.expiresAt.getTime() > now) })),
    });
  } catch (err) { handle(res, err, 'load this user'); }
};

// ---------- PUT /users/:id ----------
export const updateUser = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    const ok = canManage(req.user, user);
    if (!ok.ok) return res.status(ok.status).json({ message: ok.message });
    const b = req.body || {};
    const errors = {};
    const clean = (v) => String(v).replace(/\s+/g, ' ').trim();
    const next = {};
    if (b.fullName !== undefined) { next.fullName = clean(b.fullName); if (next.fullName.length < 2 || next.fullName.length > 80) errors.fullName = 'Enter a name (2–80 characters)'; }
    if (b.email !== undefined) {
      next.email = clean(b.email).toLowerCase();
      if (!isEmail(next.email) || next.email.length > 120) errors.email = 'Enter a valid email address';
      else if (next.email !== user.email && (await User.exists({ email: next.email, _id: { $ne: user._id } }))) errors.email = 'Already used by another account';
    }
    if (b.phone !== undefined) { next.phone = clean(b.phone); if (next.phone && !/^[+\d][\d\s-]{6,18}$/.test(next.phone)) errors.phone = 'Enter a valid phone number'; }
    if (b.businessName !== undefined) { next.businessName = clean(b.businessName); if (next.businessName.length > 100) errors.businessName = 'Keep this under 100 characters'; }
    if (b.ownerNotes !== undefined) { next.ownerNotes = String(b.ownerNotes).replace(/\r\n/g, '\n').trim(); if (next.ownerNotes.length > 2000) errors.ownerNotes = 'Notes can be up to 2000 characters'; }
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Please fix the highlighted fields', errors });

    const changed = Object.keys(next).filter((k) => String(next[k] ?? '') !== String(user[k] ?? ''));
    if (!changed.length) return res.json({ user: serialize(user, { ownerNotes: user.ownerNotes || '' }), changed });
    const emailChanged = changed.includes('email');
    const old = { email: user.email };
    changed.forEach((k) => { user[k] = next[k]; });
    if (emailChanged) user.tokenVersion = (user.tokenVersion || 0) + 1; // the old address's sessions end
    await user.save();
    await logAudit(req, 'user.update', {
      entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`,
      summary: `Edited ${label(user)} (${changed.filter((c) => c !== 'ownerNotes').join(', ') || 'private notes'})`,
      meta: { changed, ...(emailChanged && { emailFrom: old.email, emailTo: user.email }) }, // note text itself is not copied into the log
    });
    res.json({ user: serialize(user, { ownerNotes: user.ownerNotes || '' }), changed });
  } catch (err) { handle(res, err, 'save this user'); }
};

// ---------- status actions (each is a thin wrapper over utils/userActions.js) ----------
const act = (fn, pick) => async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const out = await fn(user, req.user, req, pick(req));
    res.json({ user: serialize(out.user), emailSent: out.emailSent });
  } catch (err) { handle(res, err); }
};
export const approve = act((u, a, r) => approveUser(u, a, r), () => undefined);
export const reject = act((u, a, r, p) => rejectUser(u, a, r, p), (req) => req.body?.reason);
export const suspend = act((u, a, r, p) => suspendUser(u, a, r, p), (req) => ({ reason: req.body?.reason, until: req.body?.until }));
export const reactivate = act((u, a, r) => reactivateUser(u, a, r), () => undefined);
export const terminate = act((u, a, r, p) => terminateUser(u, a, r, p), (req) => ({ reason: req.body?.reason, confirmEmail: req.body?.confirmEmail }));
export const restore = act((u, a, r) => restoreUser(u, a, r), () => undefined);
export const forceLogout = act((u, a, r) => forceLogoutUser(u, a, r), () => undefined);

// ---------- POST /users/:id/reset-password  { mode: 'link' | 'temp' } ----------
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no look-alikes (0/O, 1/l/I)
const makeTempPassword = () => {
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = [pick('ABCDEFGHJKMNPQRSTUVWXYZ'), pick('abcdefghjkmnpqrstuvwxyz'), pick('23456789'), pick('23456789')];
  while (chars.length < 12) chars.push(pick(TEMP_ALPHABET));
  for (let i = chars.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
};
export const resetPassword = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    const ok = canManage(req.user, user);
    if (!ok.ok) return res.status(ok.status).json({ message: ok.message });
    if (user.accessStatus === 'terminated') return res.status(400).json({ message: 'This account is terminated. Restore it before resetting the password.' });
    const mode = req.body?.mode;
    if (mode === 'link') {
      try { await sendResetLink(user); } catch (e) { console.error('[users] reset link not sent:', e.hint || e.message); return res.status(502).json({ message: 'We could not email the reset link. Try again, or generate a temporary password instead.' }); }
      await logAudit(req, 'user.reset_password', { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, summary: `Sent a password-reset link to ${label(user)}`, meta: { mode } });
      return res.json({ mode, message: `A reset link was emailed to ${user.email}.` });
    }
    if (mode === 'temp') {
      const temporaryPassword = makeTempPassword();
      user.password = temporaryPassword;
      user.resetToken = undefined; user.resetTokenExpires = undefined;
      user.tokenVersion = (user.tokenVersion || 0) + 1; // every session ends
      await user.save();
      await logAudit(req, 'user.reset_password', { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, summary: `Set a temporary password for ${label(user)}`, meta: { mode } }); // the password itself is never logged
      res.set('Cache-Control', 'no-store');
      return res.json({ mode, temporaryPassword, message: 'Shown once — copy it now and share it securely. All their sessions were ended.' });
    }
    return res.status(400).json({ message: 'Choose "link" or "temp".' });
  } catch (err) { return handle(res, err, 'reset the password'); }
};

// ---------- POST /users/:id/resend-email  { kind: 'verification' | 'approval' } ----------
export const resendEmail = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'client') return res.status(403).json({ message: 'Owner accounts do not use this.' });
    const kind = req.body?.kind;
    if (kind === 'verification') {
      if (user.isEmailVerified) return res.status(400).json({ message: 'This email address is already verified.' });
      try { await sendVerificationOtp(user); } catch (e) { console.error('[users] verification email not sent:', e.hint || e.message); return res.status(502).json({ message: 'We could not send the email right now. Try again in a few minutes.' }); }
    } else if (kind === 'approval') {
      if (user.approvalStatus !== 'approved') return res.status(400).json({ message: 'This account has not been approved yet.' });
      try { const m = await renderEmail('approved', { clientName: label(user), clientId: user.clientId }); await sendEmail({ to: user.email, subject: m.subject, html: m.html }); } catch (e) { console.error('[users] approval email not sent:', e.hint || e.message); return res.status(502).json({ message: 'We could not send the email right now. Try again in a few minutes.' }); }
    } else return res.status(400).json({ message: 'Choose "verification" or "approval".' });
    await logAudit(req, 'user.resend_email', { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, summary: `Re-sent the ${kind} email to ${label(user)}`, meta: { kind } });
    res.json({ message: `The ${kind} email was sent to ${user.email}.` });
  } catch (err) { handle(res, err, 'send that email'); }
};

// ---------- GET /users/:id/export  (everything we hold about one user, as JSON) ----------
export async function collectUserData(user) {
  const [projects, invoices, receipts, deliverables, tickets, activity, logins] = await Promise.all([
    Project.find({ client: user._id }).lean(), Invoice.find({ client: user._id }).lean(), Receipt.find({ client: user._id }).select('-issuer -idempotencyKey').lean(),
    Deliverable.find({ client: user._id }).lean(), SupportTicket.find({ client: user._id }).lean(), Activity.find({ client: user._id }).lean(),
    LoginEvent.find({ user: user._id }).select('-tokenVersion').lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    user: serialize(user, { ownerNotes: user.ownerNotes || '', statusHistory: user.statusHistory || [] }),
    projects, invoices, receipts, deliverables, tickets, activity, logins,
  };
}
export const exportUserData = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const data = await collectUserData(user);
    await logAudit(req, 'user.export', { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, summary: `Exported all data of ${label(user)}` });
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="codexora-user-${String(user._id).slice(-6)}.json"`, 'Cache-Control': 'private, no-store' });
    res.send(JSON.stringify(data, null, 2));
  } catch (err) { handle(res, err, 'export this user'); }
};

// ---------- DELETE /users/:id  (permanent — terminated clients only, typed confirmation) ----------
export const hardDelete = async (req, res) => {
  try {
    const user = await loadUser(req.params.id);
    const ok = canManage(req.user, user);
    if (!ok.ok) return res.status(ok.status).json({ message: ok.message });
    if (user.accessStatus !== 'terminated') return res.status(400).json({ message: 'Only terminated accounts can be permanently deleted. Terminate it first.', code: 'not_terminated' });
    if (req.body?.confirm !== 'DELETE') return res.status(400).json({ message: 'Type DELETE to confirm.', code: 'confirm_mismatch' });

    const counts = {
      projects: await Project.countDocuments({ client: user._id }), invoices: await Invoice.countDocuments({ client: user._id }), receipts: await Receipt.countDocuments({ client: user._id }),
      files: await Deliverable.countDocuments({ client: user._id }), tickets: await SupportTicket.countDocuments({ client: user._id }),
    };
    // the audit entry is written FIRST, so even if the delete is interrupted there is a record of who decided it
    await logAudit(req, 'user.delete', { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, summary: `Permanently deleted ${label(user)} and their data`, meta: { email: user.email, ...counts } });

    await Promise.all([
      Project.deleteMany({ client: user._id }), Invoice.deleteMany({ client: user._id }), Receipt.deleteMany({ client: user._id }), Deliverable.deleteMany({ client: user._id }),
      SupportTicket.deleteMany({ client: user._id }), Activity.deleteMany({ client: user._id }), Notification.deleteMany({ recipient: user._id }), LoginEvent.deleteMany({ user: user._id }),
    ]);
    await User.deleteOne({ _id: user._id });
    res.json({ message: `${label(user)} and their data were permanently deleted.`, deleted: counts });
  } catch (err) { handle(res, err, 'delete this user'); }
};

// ---------- POST /users/bulk ----------
const BULK = {
  approve: (u, a, r) => approveUser(u, a, r),
  suspend: (u, a, r, ctx) => suspendUser(u, a, r, { reason: ctx.reason, until: ctx.until }),
  reactivate: (u, a, r) => reactivateUser(u, a, r),
  terminate: (u, a, r, ctx) => terminateUserConfirmed(u, a, r, ctx.reason),
};
export const bulkAction = async (req, res) => {
  try {
    const { action, ids, reason, until, confirm } = req.body || {};
    if (!BULK[action]) return res.status(400).json({ message: 'Choose approve, suspend, reactivate or terminate.' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'Select at least one user.' });
    if (ids.length > 50) return res.status(400).json({ message: 'Select at most 50 users at a time.' });
    if (action === 'terminate') {
      if (String(reason || '').trim().length < 3) return res.status(400).json({ message: 'Give a reason for terminating these accounts.', code: 'reason_required' });
      if (confirm !== 'TERMINATE') return res.status(400).json({ message: 'Type TERMINATE to confirm.', code: 'confirm_mismatch' });
    }
    const results = [];
    for (const id of [...new Set(ids.map(String))]) {
      try {
        const user = await loadUser(id);
        if (!user) throw fail(404, 'User not found');
        const out = await BULK[action](user, req.user, req, { reason, until });
        results.push({ id, name: label(user), ok: true, emailSent: out.emailSent });
      } catch (err) {
        results.push({ id, ok: false, message: err.status ? err.message : 'Could not complete this one.' });
        if (!err.status) console.error('[users] bulk item failed:', err);
      }
    }
    const done = results.filter((r) => r.ok).length;
    await logAudit(req, 'user.bulk', { entityType: 'user', entityLabel: `${action} × ${ids.length}`, summary: `Bulk ${action}: ${done} of ${results.length} succeeded`, meta: { action, requested: results.length, succeeded: done, reason: reason ? String(reason).slice(0, 300) : undefined } });
    res.json({ results, summary: { requested: results.length, succeeded: done, failed: results.length - done } });
  } catch (err) { handle(res, err, 'run that bulk action'); }
};

// ---------- audit log, scoped to user management (+ CSV) ----------
const USER_ACTIONS = '^(user\\.|client\\.approve$|client\\.reject$)';
const auditFilter = (query) => {
  const built = buildFilter(query);
  if (query.scope === 'users') built.filter = { $and: [built.filter, { action: { $regex: USER_ACTIONS } }] };
  return built;
};
export const listUserAudit = async (req, res) => {
  try {
    const { filter, page, limit } = auditFilter(req.query);
    const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), AuditLog.countDocuments(filter)]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) { handle(res, err, 'load the audit log'); }
};
export const exportAuditCsv = async (req, res) => {
  try {
    const { filter } = auditFilter(req.query);
    const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(rows, [
      { header: 'When (UTC)', value: (r) => r.createdAt }, { header: 'Who', value: (r) => r.actor?.name || '' }, { header: 'Who (email)', value: (r) => r.actor?.email || '' },
      { header: 'Action', value: (r) => ACTIONS[r.action]?.label || r.action }, { header: 'Summary', value: (r) => r.summary }, { header: 'Item', value: (r) => r.entityLabel },
      { header: 'Item ID', value: (r) => r.entityId }, { header: 'Reason', value: (r) => r.meta?.reason || '' }, { header: 'IP address', value: (r) => r.ip }, { header: 'Device', value: (r) => describeDevice(r.userAgent) },
    ]);
    await logAudit(req, 'export.download', { entityType: 'audit', entityLabel: 'Audit log', summary: `Exported ${rows.length} audit entries to CSV`, meta: { count: rows.length, scope: req.query.scope || 'all' } });
    sendCsv(res, `codexora-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (err) { handle(res, err, 'export the audit log'); }
};
