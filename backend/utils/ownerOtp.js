// DB + email side of the owner sign-in code (the pure helpers live in ownerOtpCore.js).
import User from '../models/User.js';
import Challenge from '../models/OwnerLoginChallenge.js';
import sendEmail from './sendEmail.js';
import { getSettings } from './settings.js';
import * as core from './ownerOtpCore.js';

const { CONFIG } = core;
export const needsOwnerOtp = core.needsOwnerOtp;

const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const clientView = (challengeId, user) => ({
  twoFactorRequired: true,
  challengeId,
  maskedEmail: core.maskEmail(user.email),
  expiresInSec: CONFIG.CODE_TTL_MS / 1000,
  resendAfterSec: CONFIG.RESEND_COOLDOWN_MS / 1000,
});

async function sendCode(user, code, req) {
  const s = await getSettings().catch(() => null);
  const mail = core.otpEmail({
    code, name: user.fullName, ip: req.ip, device: core.describeDevice(req.headers?.['user-agent']), businessName: s?.business?.name,
  });
  await sendEmail({ to: user.email, subject: mail.subject, html: mail.html });
}

// Called by login AFTER the password (and CAPTCHA) passed. Returns the JSON to send to the browser.
export async function startOwnerChallenge(req, user) {
  const since = new Date(Date.now() - CONFIG.CHALLENGE_WINDOW_MS);
  if ((await Challenge.countDocuments({ user: user._id, createdAt: { $gte: since } })) >= CONFIG.MAX_CHALLENGES) {
    throw fail(429, 'Too many sign-in attempts. Wait 15 minutes and try again.');
  }
  const challengeId = core.newChallengeId();
  const code = core.generateCode();
  const row = await Challenge.create({
    user: user._id, idHash: core.hashId(challengeId), codeHash: core.hashCode(challengeId, code),
    expiresAt: new Date(Date.now() + CONFIG.CODE_TTL_MS), ip: req.ip, userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
  });
  try { await sendCode(user, code, req); }
  catch (err) {
    await Challenge.deleteOne({ _id: row._id });
    console.error('[owner-otp] email failed:', err.message);
    throw fail(503, 'We could not email your sign-in code. Check the SMTP settings or try again in a minute.');
  }
  return clientView(challengeId, user);
}

export async function resendOwnerCode(req, challengeId) {
  const now = new Date();
  const code = core.generateCode();
  const row = await Challenge.findOneAndUpdate(
    {
      idHash: core.hashId(challengeId), usedAt: null, expiresAt: { $gt: now },
      resends: { $lt: CONFIG.MAX_RESENDS }, lastSentAt: { $lte: new Date(now - CONFIG.RESEND_COOLDOWN_MS) },
    },
    { $set: { codeHash: core.hashCode(challengeId, code), lastSentAt: now, expiresAt: new Date(+now + CONFIG.CODE_TTL_MS), attempts: 0 }, $inc: { resends: 1 } },
    { returnDocument: 'after' }
  );
  if (!row) throw fail(429, 'Please wait a minute before asking for another code, or sign in again.');
  const user = await User.findById(row.user);
  try { await sendCode(user, code, req); }
  catch (err) { console.error('[owner-otp] resend failed:', err.message); throw fail(503, 'We could not email your sign-in code. Try again in a minute.'); }
  return { ...clientView(challengeId, user), resendsLeft: CONFIG.MAX_RESENDS - row.resends };
}

// Returns the owner User on success. Throws { status, message, code, user? } otherwise.
export async function verifyOwnerCode(challengeId, submitted) {
  const now = new Date();
  // Claim one attempt atomically BEFORE comparing, so parallel guesses can't exceed MAX_ATTEMPTS.
  const row = await Challenge.findOneAndUpdate(
    { idHash: core.hashId(challengeId), usedAt: null, expiresAt: { $gt: now }, attempts: { $lt: CONFIG.MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } }, { returnDocument: 'after' }
  );
  if (!row) throw fail(401, 'This code has expired or is no longer valid. Sign in again.', { code: 'invalid_challenge' });

  if (!core.codesMatch(row.codeHash, challengeId, submitted)) {
    const left = CONFIG.MAX_ATTEMPTS - row.attempts;
    const user = await User.findById(row.user);
    throw fail(401, left > 0 ? `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many incorrect codes. Sign in again.',
      { code: left > 0 ? 'wrong_code' : 'locked', attemptsLeft: left, user });
  }
  const claimed = await Challenge.findOneAndUpdate({ _id: row._id, usedAt: null }, { usedAt: now }); // single use, race-safe
  if (!claimed) throw fail(401, 'This code has already been used. Sign in again.', { code: 'invalid_challenge' });
  const user = await User.findById(row.user);
  if (!user || user.role !== 'owner') throw fail(401, 'Sign in again.', { code: 'invalid_challenge' });
  return user;
}
