// "My Account" — the signed-in owner's own details. Every route is owner-only (mounted behind protect + roleGuard('owner')).
// Business details are NOT stored twice: they read and write the same Settings record the Settings tab and the receipts use.
import crypto from 'crypto';
import multer from 'multer';
import User from '../models/User.js';
import LoginEvent from '../models/LoginEvent.js';
import Project from '../models/Project.js';
import Invoice from '../models/Invoice.js';
import sendEmail from '../utils/sendEmail.js';
import generateOtp from '../utils/generateOtp.js';
import generateToken from '../utils/generateToken.js';
import { logAudit } from '../utils/audit.js';
import { getSettings, saveSettings } from '../utils/settings.js';
import { sanitizeSettings, diffPaths } from '../utils/settingsDefaults.js';
import { totalCollected } from '../utils/receipt.js';
import { passwordStrength, isEmail } from '../utils/userStatus.js';
import { describeDevice } from '../utils/ownerOtpCore.js';
import { createLimiter } from '../utils/attempts.js';
import { uploadBufferToCloudinary, destroyCloudinaryImage } from '../utils/cloudinary.js';

const wrongPasswords = createLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const THEMES = ['light', 'dark', 'system'];
const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const NOTIFY_TYPES = ['ticket', 'lead', 'approval'];
const EMAIL_OTP_MINUTES = 10;

const send = (res, status, message, extra = {}) => res.status(status).json({ message, ...extra });
const fail = (res, err, what) => { console.error(`[account] ${what}:`, err); return send(res, 500, `Could not ${what}. Please try again.`); };

// Sensitive changes need the current password again. Wrong guesses are capped so a stolen session can't be used to guess it.
async function requireCurrentPassword(req, res, owner, password) {
  const key = String(owner._id);
  if (wrongPasswords.blocked(key)) { send(res, 429, `Too many wrong passwords. Try again in ${wrongPasswords.minutesLeft(key)} minutes.`, { code: 'too_many_attempts' }); return false; }
  if (!password) { send(res, 400, 'Enter your current password to confirm this change.', { code: 'password_required' }); return false; }
  if (!(await owner.comparePassword(String(password)))) {
    wrongPasswords.hit(key);
    send(res, 401, 'Current password is incorrect.', { code: 'wrong_password' });
    return false;
  }
  wrongPasswords.reset(key);
  return true;
}

const owner$ = (req) => User.findById(req.user._id);
const effectiveTwoFactor = (u) => u.twoFactorEnabled !== false;

const businessView = (s) => ({
  name: s.business.name, address: s.business.address, gstin: s.business.gstin, pan: s.business.pan, website: s.business.website,
  upiId: s.business.upiId, bankDetails: s.business.bankDetails, logoUrl: s.business.logoUrl, receiptNote: s.receipt.notes,
});
const prefsView = (u) => ({
  theme: u.preferences?.theme || 'system',
  dateFormat: u.preferences?.dateFormat || 'DD MMM YYYY',
  notificationsEnabled: u.notificationsEnabled !== false,
  notifyTypes: Object.fromEntries(NOTIFY_TYPES.map((t) => [t, u.preferences?.notifyTypes?.[t] !== false])),
});
const profileView = (u) => ({
  fullName: u.fullName, email: u.email, phone: u.phone || '', designation: u.designation || '', avatarUrl: u.avatarUrl || '',
  role: u.role, memberSince: u.createdAt, lastLoginAt: u.lastLoginAt,
});

// ---------- GET /api/owner/account ----------
export const getAccount = async (req, res) => {
  try {
    const owner = await owner$(req);
    const [settings, totalClients, activeClients, projects, invoices, revenue] = await Promise.all([
      getSettings(true),
      User.countDocuments({ role: 'client', approvalStatus: 'approved' }),
      User.countDocuments({ role: 'client', approvalStatus: 'approved', accessStatus: { $nin: ['suspended', 'terminated'] } }),
      Project.countDocuments(),
      Invoice.countDocuments(),
      totalCollected(),
    ]);
    res.json({
      profile: profileView(owner),
      business: businessView(settings),
      security: { twoFactorEnabled: effectiveTwoFactor(owner), twoFactorForcedOff: String(process.env.OWNER_2FA || 'on').toLowerCase() === 'off' },
      preferences: prefsView(owner),
      summary: { totalClients, activeClients, projects, invoices, revenueCollected: revenue, memberSince: owner.createdAt },
    });
  } catch (err) { fail(res, err, 'load your account'); }
};

// ---------- PUT /profile ----------
export const updateProfile = async (req, res) => {
  try {
    const { fullName, phone, designation } = req.body || {};
    const errors = {};
    const name = fullName === undefined ? undefined : String(fullName).replace(/\s+/g, ' ').trim();
    if (name !== undefined && (name.length < 2 || name.length > 80)) errors.fullName = 'Enter your name (2–80 characters)';
    const ph = phone === undefined ? undefined : String(phone).replace(/\s+/g, ' ').trim();
    if (ph && !/^[+\d][\d\s-]{6,18}$/.test(ph)) errors.phone = 'Enter a valid phone number';
    const des = designation === undefined ? undefined : String(designation).replace(/\s+/g, ' ').trim();
    if (des && des.length > 60) errors.designation = 'Keep this under 60 characters';
    if (Object.keys(errors).length) return send(res, 400, 'Please fix the highlighted fields', { errors });

    const owner = await owner$(req);
    const changed = [];
    if (name !== undefined && name !== owner.fullName) { owner.fullName = name; changed.push('fullName'); }
    if (ph !== undefined && ph !== (owner.phone || '')) { owner.phone = ph; changed.push('phone'); }
    if (des !== undefined && des !== (owner.designation || '')) { owner.designation = des; changed.push('designation'); }
    if (changed.length) {
      await owner.save();
      await logAudit(req, 'account.profile_update', { entityType: 'account', entityId: owner._id, entityLabel: 'Owner profile', summary: `Owner profile updated (${changed.join(', ')})`, meta: { changed } });
    }
    res.json({ profile: profileView(owner), changed });
  } catch (err) { fail(res, err, 'save your profile'); }
};

// ---------- photo / logo upload ----------
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Only JPG, PNG or WebP images are allowed.'), { status: 400 }))),
});
// multer reports its own errors; turn them into the same JSON shape as everything else
const oneImage = (field) => (req, res, next) =>
  imageUpload.single(field)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return send(res, 413, 'That image is larger than 2 MB. Choose a smaller one.');
    return send(res, err.status || 400, err.message || 'Could not read that image.');
  });
export const avatarUpload = oneImage('avatar');
export const logoUpload = oneImage('logo');

// the first bytes of a real JPEG / PNG / WebP — the browser-reported type alone can be faked
export const looksLikeImage = (b) =>
  !!b && b.length > 12 && (
    (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b[0] === 0x89 && b.subarray(1, 4).toString() === 'PNG') ||
    (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP')
  );

const publicIdFromUrl = (url) => (/\/upload\/(?:v\d+\/)?(.+)\.[A-Za-z0-9]+$/.exec(url || '') || [])[1];

export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return send(res, 400, 'Choose an image to upload.');
    if (!looksLikeImage(req.file.buffer)) return send(res, 400, 'That file is not a valid JPG, PNG or WebP image.');
    const owner = await User.findById(req.user._id).select('+avatarPublicId');
    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'codexora-portal/avatars', { resource_type: 'image' });
    const previous = owner.avatarPublicId;
    owner.avatarUrl = result.secure_url;
    owner.avatarPublicId = result.public_id;
    await owner.save();
    await destroyCloudinaryImage(previous);
    await logAudit(req, 'account.avatar_update', { entityType: 'account', entityId: owner._id, entityLabel: 'Owner profile', summary: 'Profile photo changed' });
    res.json({ avatarUrl: owner.avatarUrl });
  } catch (err) { fail(res, err, 'upload the photo'); }
};

export const removeAvatar = async (req, res) => {
  try {
    const owner = await User.findById(req.user._id).select('+avatarPublicId');
    const previous = owner.avatarPublicId;
    owner.avatarUrl = undefined; owner.avatarPublicId = undefined;
    await owner.save();
    await destroyCloudinaryImage(previous);
    await logAudit(req, 'account.avatar_update', { entityType: 'account', entityId: owner._id, entityLabel: 'Owner profile', summary: 'Profile photo removed' });
    res.json({ avatarUrl: '' });
  } catch (err) { fail(res, err, 'remove the photo'); }
};

// ---------- PUT /business (same record as the Settings tab) ----------
const BUSINESS_PATHS = {
  name: 'business.name', address: 'business.address', gstin: 'business.gstin', pan: 'business.pan', website: 'business.website',
  upiId: 'business.upiId', bankDetails: 'business.bankDetails', logoUrl: 'business.logoUrl', receiptNote: 'receipt.notes',
};
const pathToField = Object.fromEntries(Object.entries(BUSINESS_PATHS).map(([k, v]) => [v, k]));

async function saveBusiness(req, res, patch, summary) {
  const input = {};
  for (const [field, path] of Object.entries(BUSINESS_PATHS)) {
    if (patch[field] === undefined) continue;
    const [group, key] = path.split('.');
    (input[group] ||= {})[key] = patch[field];
  }
  const before = await getSettings(true);
  const { data, errors } = sanitizeSettings(input, before);
  if (Object.keys(errors).length) {
    return send(res, 400, 'Please fix the highlighted fields', { errors: Object.fromEntries(Object.entries(errors).map(([p, m]) => [pathToField[p] || p, m])) });
  }
  const changed = diffPaths(before, data).map((p) => pathToField[p] || p);
  if (!changed.length) return res.json({ business: businessView(before), changed });
  const saved = await saveSettings(data, req.user._id);
  await logAudit(req, 'account.business_update', { entityType: 'settings', entityLabel: 'Business details', summary: summary || `Business details changed (${changed.join(', ')})`, meta: { changed } });
  return res.json({ business: businessView(saved), changed });
}

export const updateBusiness = async (req, res) => {
  try { await saveBusiness(req, res, req.body || {}); } catch (err) { fail(res, err, 'save the business details'); }
};

export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) return send(res, 400, 'Choose an image to upload.');
    if (!looksLikeImage(req.file.buffer)) return send(res, 400, 'That file is not a valid JPG, PNG or WebP image.');
    const before = await getSettings(true);
    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.mimetype, 'codexora-portal/logo', { resource_type: 'image' });
    await saveBusiness(req, res, { logoUrl: result.secure_url }, 'Business logo changed');
    await destroyCloudinaryImage(publicIdFromUrl(before.business.logoUrl));
  } catch (err) { if (!res.headersSent) fail(res, err, 'upload the logo'); }
};

export const removeLogo = async (req, res) => {
  try {
    const before = await getSettings(true);
    await saveBusiness(req, res, { logoUrl: '' }, 'Business logo removed');
    await destroyCloudinaryImage(publicIdFromUrl(before.business.logoUrl));
  } catch (err) { if (!res.headersSent) fail(res, err, 'remove the logo'); }
};

// ---------- PUT /password ----------
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    const owner = await owner$(req);
    if (!(await requireCurrentPassword(req, res, owner, currentPassword))) return undefined;

    const errors = {};
    const strength = passwordStrength(String(newPassword || ''));
    if (!strength.ok) errors.newPassword = `Use ${strength.issues.join(', ')}`;
    if (newPassword !== confirmPassword) errors.confirmPassword = 'The two passwords do not match';
    if (!errors.newPassword && String(newPassword) === String(currentPassword)) errors.newPassword = 'Choose a password different from the current one';
    if (Object.keys(errors).length) return send(res, 400, 'Please fix the highlighted fields', { errors });

    owner.password = String(newPassword); // the model hashes it on save
    owner.tokenVersion = (owner.tokenVersion || 0) + 1; // every OTHER device is signed out
    await owner.save();
    // this device stays signed in: same session, new generation
    await LoginEvent.updateOne({ _id: req.sessionId, user: owner._id }, { $set: { tokenVersion: owner.tokenVersion } }).catch(() => {});
    await logAudit(req, 'auth.password_changed', { actor: owner, summary: 'Owner changed their password (all other devices signed out)' });
    sendEmail({ to: owner.email, subject: 'Your Codexora owner password was changed', html: '<p style="font-family:Arial,sans-serif">Your owner password was just changed and every other device was signed out. If this was not you, reset your password immediately.</p>' }).catch(() => {});
    return res.json({ message: 'Password changed. Other devices were signed out.', token: generateToken(owner, req.sessionId) });
  } catch (err) { return fail(res, err, 'change the password'); }
};

// ---------- email change, verified with a code sent to the NEW address ----------
const emailOtpHash = (userId, email, otp) =>
  crypto.createHmac('sha256', `email-change:${process.env.JWT_SECRET}`).update(`${userId}|${email}|${otp}`).digest('hex');

export const requestEmailChange = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body || {};
    const owner = await User.findById(req.user._id).select('+pendingEmailSentAt');
    if (!(await requireCurrentPassword(req, res, owner, currentPassword))) return undefined;

    const email = String(newEmail || '').trim().toLowerCase();
    if (!isEmail(email) || email.length > 120) return send(res, 400, 'Enter a valid email address.', { errors: { newEmail: 'Enter a valid email address' } });
    if (email === owner.email) return send(res, 400, 'That is already your email address.', { errors: { newEmail: 'That is already your email address' } });
    if (await User.exists({ email })) return send(res, 409, 'That email address is already used by another account.', { errors: { newEmail: 'Already used by another account' } });
    if (owner.pendingEmailSentAt && Date.now() - owner.pendingEmailSentAt.getTime() < 60 * 1000) return send(res, 429, 'Please wait a minute before asking for another code.', { code: 'cooldown' });

    const otp = generateOtp();
    owner.pendingEmail = email;
    owner.pendingEmailOtpHash = emailOtpHash(owner._id, email, otp);
    owner.pendingEmailExpires = new Date(Date.now() + EMAIL_OTP_MINUTES * 60 * 1000);
    owner.pendingEmailAttempts = 0;
    owner.pendingEmailSentAt = new Date();
    await owner.save();
    try {
      await sendEmail({
        to: email, subject: `${otp} is your Codexora email-change code`,
        html: `<div style="font-family:Arial,sans-serif;max-width:420px"><h2 style="color:#14161C">Confirm your new email</h2><p style="color:#6B7280">Enter this code in My Account to confirm this address:</p><div style="font-size:28px;font-weight:700;letter-spacing:8px;color:#14B8A6;margin:16px 0">${otp}</div><p style="color:#6B7280;font-size:13px">It expires in ${EMAIL_OTP_MINUTES} minutes. If you did not ask for this, ignore this email.</p></div>`,
      });
    } catch (e) {
      console.error('[account] email-change code not sent:', e.hint || e.message);
      owner.pendingEmail = undefined; owner.pendingEmailOtpHash = undefined; owner.pendingEmailExpires = undefined; owner.pendingEmailSentAt = undefined;
      await owner.save();
      return send(res, 503, 'We could not email the code to that address. Check it and try again.');
    }
    return res.json({ message: `A 6-digit code was sent to ${email}.`, expiresInMinutes: EMAIL_OTP_MINUTES });
  } catch (err) { return fail(res, err, 'start the email change'); }
};

export const verifyEmailChange = async (req, res) => {
  try {
    const otp = String(req.body?.otp || '').replace(/\s/g, '');
    const owner = await User.findById(req.user._id).select('+pendingEmail +pendingEmailOtpHash +pendingEmailExpires +pendingEmailAttempts');
    if (!owner.pendingEmail || !owner.pendingEmailOtpHash) return send(res, 400, 'No email change is in progress. Request a new code.', { code: 'no_request' });
    if (owner.pendingEmailExpires < new Date()) return send(res, 400, 'That code has expired. Request a new one.', { code: 'expired' });
    if ((owner.pendingEmailAttempts || 0) >= 5) return send(res, 429, 'Too many wrong codes. Request a new one.', { code: 'locked' });
    if (!/^\d{6}$/.test(otp)) return send(res, 400, 'Enter the 6-digit code.', { errors: { otp: 'Enter the 6-digit code' } });

    const expected = Buffer.from(owner.pendingEmailOtpHash, 'hex');
    const given = Buffer.from(emailOtpHash(owner._id, owner.pendingEmail, otp), 'hex');
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      owner.pendingEmailAttempts = (owner.pendingEmailAttempts || 0) + 1;
      await owner.save();
      const left = 5 - owner.pendingEmailAttempts;
      return send(res, 400, left > 0 ? `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Request a new one.', { errors: { otp: 'Incorrect code' } });
    }

    const oldEmail = owner.email;
    const newEmail = owner.pendingEmail;
    if (await User.exists({ email: newEmail, _id: { $ne: owner._id } })) return send(res, 409, 'That email address was just taken by another account.');
    owner.email = newEmail;
    owner.pendingEmail = undefined; owner.pendingEmailOtpHash = undefined; owner.pendingEmailExpires = undefined; owner.pendingEmailAttempts = undefined; owner.pendingEmailSentAt = undefined;
    await owner.save();
    await logAudit(req, 'account.email_changed', { actor: owner, entityType: 'account', entityId: owner._id, entityLabel: 'Owner email', summary: `Owner email changed from ${oldEmail} to ${newEmail}`, meta: { from: oldEmail, to: newEmail } });
    sendEmail({ to: oldEmail, subject: 'Your Codexora owner email was changed', html: `<p style="font-family:Arial,sans-serif">The sign-in email for the Codexora owner account was changed to <b>${newEmail}</b>. If this was not you, contact support immediately.</p>` }).catch(() => {});
    return res.json({ message: 'Email address updated.', email: owner.email });
  } catch (err) { return fail(res, err, 'confirm the new email'); }
};

// ---------- PUT /two-factor ----------
export const setTwoFactor = async (req, res) => {
  try {
    const { enabled, currentPassword } = req.body || {};
    if (typeof enabled !== 'boolean') return send(res, 400, 'Say whether two-factor login should be on or off.');
    const owner = await owner$(req);
    if (!(await requireCurrentPassword(req, res, owner, currentPassword))) return undefined;
    owner.twoFactorEnabled = enabled;
    await owner.save();
    await logAudit(req, 'account.two_factor_changed', { actor: owner, entityType: 'account', entityId: owner._id, entityLabel: 'Two-factor login', summary: `Two-factor email login turned ${enabled ? 'ON' : 'OFF'}`, meta: { enabled } });
    return res.json({ twoFactorEnabled: enabled, twoFactorForcedOff: String(process.env.OWNER_2FA || 'on').toLowerCase() === 'off' });
  } catch (err) { return fail(res, err, 'change two-factor login'); }
};

// ---------- PUT /preferences ----------
export const updatePreferences = async (req, res) => {
  try {
    const { theme, dateFormat, notificationsEnabled, notifyTypes } = req.body || {};
    const errors = {};
    if (theme !== undefined && !THEMES.includes(theme)) errors.theme = 'Choose light, dark or system';
    if (dateFormat !== undefined && !DATE_FORMATS.includes(dateFormat)) errors.dateFormat = 'Choose one of the listed formats';
    if (notificationsEnabled !== undefined && typeof notificationsEnabled !== 'boolean') errors.notificationsEnabled = 'Must be on or off';
    if (notifyTypes !== undefined && (typeof notifyTypes !== 'object' || notifyTypes === null || Object.entries(notifyTypes).some(([k, v]) => !NOTIFY_TYPES.includes(k) || typeof v !== 'boolean'))) errors.notifyTypes = 'Invalid notification options';
    if (Object.keys(errors).length) return send(res, 400, 'Please fix the highlighted fields', { errors });

    const owner = await owner$(req);
    if (theme !== undefined) owner.set('preferences.theme', theme);
    if (dateFormat !== undefined) owner.set('preferences.dateFormat', dateFormat);
    if (notificationsEnabled !== undefined) owner.notificationsEnabled = notificationsEnabled;
    for (const [k, v] of Object.entries(notifyTypes || {})) owner.set(`preferences.notifyTypes.${k}`, v);
    await owner.save();
    await logAudit(req, 'account.preferences_update', { entityType: 'account', entityId: owner._id, entityLabel: 'Preferences', summary: 'Owner preferences changed', meta: { changed: Object.keys(req.body || {}) } });
    return res.json({ preferences: prefsView(owner) });
  } catch (err) { return fail(res, err, 'save your preferences'); }
};

// ---------- sessions & sign-out everywhere ----------
export const listSessions = async (req, res) => {
  try {
    const owner = await owner$(req);
    const events = await LoginEvent.find({ user: owner._id }).sort({ createdAt: -1 }).limit(20);
    const now = Date.now();
    const sessions = events.map((e) => ({
      id: e._id, at: e.createdAt, ip: e.ip || '', device: describeDevice(e.userAgent),
      current: String(e._id) === String(req.sessionId),
      active: (e.tokenVersion || 0) === (owner.tokenVersion || 0) && (!e.expiresAt || e.expiresAt.getTime() > now),
    }));
    res.json({ sessions, activeCount: sessions.filter((s) => s.active).length });
  } catch (err) { fail(res, err, 'load your sessions'); }
};

export const logoutAll = async (req, res) => {
  try {
    const owner = await owner$(req);
    if (!(await requireCurrentPassword(req, res, owner, req.body?.currentPassword))) return undefined;
    owner.tokenVersion = (owner.tokenVersion || 0) + 1;
    await owner.save();
    await logAudit(req, 'account.logout_all', { actor: owner, entityType: 'account', entityId: owner._id, entityLabel: 'Sessions', summary: 'Owner signed out of all devices' });
    return res.json({ message: 'Signed out of all devices, including this one.' });
  } catch (err) { return fail(res, err, 'sign out of all devices'); }
};
