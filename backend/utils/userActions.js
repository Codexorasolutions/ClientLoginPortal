// Every account-status change lives here, so the Pending tab, the Users tab and the bulk actions share ONE implementation.
// Each function validates, changes the account, records status history + the audit log, and emails the user (best effort:
// a mail problem never undoes the action — the result says whether the email went out).
import User from '../models/User.js';
import sendEmail from './sendEmail.js';
import generateClientId from './generateClientId.js';
import { renderEmail } from './settings.js';
import { notifyUser } from './notify.js';
import { logActivity } from './activity.js';
import { logAudit } from './audit.js';
import { canManage } from './userStatus.js';

const label = (u) => u.businessName || u.fullName;
export const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function mail(user, key, vars = {}) {
  try {
    const m = await renderEmail(key, { clientName: label(user), ...vars });
    await sendEmail({ to: user.email, subject: m.subject, html: m.html });
    return true;
  } catch (e) {
    console.error(`[user-email:${key}] not sent:`, e.hint || e.message);
    return false;
  }
}
const addHistory = (user, status, actor, reason, until) =>
  user.statusHistory.push({ status, reason: reason || undefined, by: actor?._id, byName: actor?.fullName, until, at: new Date() });
const audit = (req, action, user, extra = {}) =>
  logAudit(req, action, { entityType: 'user', entityId: user._id, entityLabel: `${label(user)} <${user.email}>`, ...extra });

const clean = (r) => String(r || '').replace(/\s+/g, ' ').trim().slice(0, 300);

// ---- approval workflow (same rules as before, shared) ----
export async function approveUser(user, actor, req) {
  if (!user) throw fail(404, 'User not found');
  if (user.role !== 'client') throw fail(400, 'Only client accounts need approval.');
  if (user.approvalStatus !== 'pending') throw fail(400, `This request is already ${user.approvalStatus}`);
  if (!user.isEmailVerified) throw fail(400, 'This person has not verified their email yet. Use "Resend verification email" first.', 'email_unverified');

  user.approvalStatus = 'approved';
  user.clientId = await generateClientId();
  addHistory(user, 'approved', actor);
  await user.save();

  const emailSent = await mail(user, 'approved', { clientId: user.clientId });
  await notifyUser(user._id, { title: 'Portal access approved', message: `Welcome! Your client ID is ${user.clientId}.`, type: 'approval' }).catch(() => {});
  await logActivity(user._id, 'approval', `Portal access approved — client ID ${user.clientId}.`).catch(() => {});
  await logAudit(req, 'client.approve', { entityType: 'client', entityId: user._id, entityLabel: label(user), meta: { clientId: user.clientId, email: user.email } });
  return { user, emailSent, clientId: user.clientId };
}

export async function rejectUser(user, actor, req, reason) {
  if (!user) throw fail(404, 'User not found');
  if (user.role !== 'client') throw fail(400, 'Only client accounts can be rejected.');
  if (user.approvalStatus !== 'pending') throw fail(400, `This request is already ${user.approvalStatus}`);
  const why = clean(reason);

  user.approvalStatus = 'rejected';
  addHistory(user, 'rejected', actor, why);
  await user.save();

  const emailSent = await mail(user, 'rejected', { reasonNote: why ? `Note: ${why}` : '' });
  await logAudit(req, 'client.reject', { entityType: 'client', entityId: user._id, entityLabel: label(user), meta: { reason: why || undefined, email: user.email } });
  return { user, emailSent };
}

// ---- access control ----
export async function suspendUser(user, actor, req, { reason, until } = {}) {
  const ok = canManage(actor, user);
  if (!ok.ok) throw fail(ok.status, ok.message);
  if (user.accessStatus === 'terminated') throw fail(400, 'This account is terminated. Restore it first.');
  if (user.accessStatus === 'suspended') throw fail(409, 'This account is already suspended.');
  if (user.approvalStatus !== 'approved') throw fail(400, 'Only approved accounts can be suspended. Pending requests are approved or rejected instead.');

  let untilDate;
  if (until) {
    untilDate = new Date(until);
    if (Number.isNaN(untilDate.getTime())) throw fail(400, 'Enter a valid re-activation date.');
    if (untilDate <= new Date()) throw fail(400, 'The re-activation date must be in the future.');
    if (untilDate - Date.now() > 730 * 864e5) throw fail(400, 'A suspension can be at most 2 years — use Terminate for longer.');
  }
  const why = clean(reason);

  user.accessStatus = 'suspended';
  user.suspendedAt = new Date();
  user.suspendedUntil = untilDate;
  user.statusReason = why || undefined;
  user.tokenVersion = (user.tokenVersion || 0) + 1; // every device is signed out right now
  addHistory(user, 'suspended', actor, why, untilDate);
  await user.save();

  const emailSent = await mail(user, 'suspended', {
    reasonNote: why ? `Reason: ${why}` : '',
    untilNote: untilDate ? `Access will be restored automatically on ${fmtDay(untilDate)}.` : '',
  });
  await audit(req, 'user.suspend', user, { summary: `Suspended ${label(user)}${untilDate ? ` until ${fmtDay(untilDate)}` : ''}`, meta: { reason: why || undefined, until: untilDate } });
  return { user, emailSent };
}

export async function reactivateUser(user, actor, req) {
  const ok = canManage(actor, user);
  if (!ok.ok) throw fail(ok.status, ok.message);
  if (user.accessStatus !== 'suspended') throw fail(400, 'This account is not suspended.');

  user.accessStatus = 'active';
  user.suspendedUntil = undefined; user.suspendedAt = undefined; user.statusReason = undefined;
  addHistory(user, 'reactivated', actor);
  await user.save();

  const emailSent = await mail(user, 'reactivated', {});
  await audit(req, 'user.reactivate', user, { summary: `Reactivated ${label(user)}` });
  return { user, emailSent };
}

export async function terminateUser(user, actor, req, { reason, confirmEmail } = {}) {
  const ok = canManage(actor, user);
  if (!ok.ok) throw fail(ok.status, ok.message);
  if (user.accessStatus === 'terminated') throw fail(409, 'This account is already terminated.');
  const why = clean(reason);
  if (why.length < 3) throw fail(400, 'Give a reason for terminating this account.', 'reason_required');
  if (String(confirmEmail || '').trim().toLowerCase() !== user.email) throw fail(400, "Type the user's email address exactly to confirm.", 'confirm_mismatch');

  user.accessStatus = 'terminated';
  user.terminatedAt = new Date();
  user.suspendedUntil = undefined; user.suspendedAt = undefined;
  user.statusReason = why;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  addHistory(user, 'terminated', actor, why);
  await user.save();

  const emailSent = await mail(user, 'terminated', { reasonNote: `Reason: ${why}` });
  await audit(req, 'user.terminate', user, { summary: `Terminated ${label(user)}`, meta: { reason: why } });
  return { user, emailSent };
}

// bulk terminate has no typed-email step (the UI asks for a typed word instead), so it calls this variant
export const terminateUserConfirmed = (user, actor, req, reason) => terminateUser(user, actor, req, { reason, confirmEmail: user?.email });

export async function restoreUser(user, actor, req) {
  const ok = canManage(actor, user);
  if (!ok.ok) throw fail(ok.status, ok.message);
  if (user.accessStatus !== 'terminated') throw fail(400, 'This account is not terminated.');

  user.accessStatus = 'active';
  user.terminatedAt = undefined; user.statusReason = undefined;
  addHistory(user, 'restored', actor);
  await user.save();

  const emailSent = await mail(user, 'reactivated', {});
  await audit(req, 'user.restore', user, { summary: `Restored ${label(user)}` });
  return { user, emailSent };
}

export async function forceLogoutUser(user, actor, req) {
  const ok = canManage(actor, user);
  if (!ok.ok) throw fail(ok.status, ok.message);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await audit(req, 'user.force_logout', user, { summary: `Signed ${label(user)} out of every device` });
  return { user };
}

export const loadUser = (id) => (id && /^[a-f\d]{24}$/i.test(String(id)) ? User.findById(id) : null);
