// utils/ownerOtpCore.js — pure logic for the owner email-OTP step (no DB, no email).
import crypto from 'crypto';

export const CONFIG = {
  CODE_TTL_MS: 10 * 60 * 1000,      // a code is valid for 10 minutes
  MAX_ATTEMPTS: 5,                  // wrong guesses per code before the challenge is dead
  RESEND_COOLDOWN_MS: 60 * 1000,    // wait before asking for another code
  MAX_RESENDS: 3,
  MAX_CHALLENGES: 5,                // new sign-in challenges per owner per window (stops email bombing)
  CHALLENGE_WINDOW_MS: 15 * 60 * 1000,
};

// 6 digits, uniformly random (crypto.randomInt avoids modulo bias)
export const generateCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// the challenge id is 256 random bits; only its SHA-256 is stored
export const newChallengeId = () => crypto.randomBytes(32).toString('hex');
export const hashId = (id) => crypto.createHash('sha256').update(String(id)).digest('hex');

// HMAC binds the code to this challenge: a leaked DB row can't be brute-forced without the server secret
export function hashCode(challengeId, code) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OTP_SECRET (or JWT_SECRET) must be set');
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${String(code)}`).digest('hex');
}

export function codesMatch(expectedHash, challengeId, submitted) {
  const given = Buffer.from(hashCode(challengeId, String(submitted || '').replace(/\D/g, '')), 'hex');
  const want = Buffer.from(expectedHash, 'hex');
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

export const maskEmail = (email = '') => {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
};

export const needsOwnerOtp = (user) =>
  !!user && user.role === 'owner' && user.twoFactorEnabled !== false && String(process.env.OWNER_2FA || 'on').toLowerCase() !== 'off';

// "Chrome on Windows" for the email, so the owner can spot a sign-in that isn't theirs
export function describeDevice(ua = '') {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'an unknown device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  return `${br} on ${os}`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function otpEmail({ code, name, ip, device, at = new Date(), businessName = 'Codexora Solutions' }) {
  const when = at.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  const mins = CONFIG.CODE_TTL_MS / 60000;
  return {
    subject: `${code} is your ${businessName} owner sign-in code`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1B1B2F;max-width:480px">
<p>Hi ${escapeHtml(name || 'there')},</p>
<p>Use this code to finish signing in to the owner portal:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#554CF9;margin:12px 0">${escapeHtml(code)}</p>
<p>It expires in ${mins} minutes and works once. Never share it with anyone — ${escapeHtml(businessName)} will never ask for it.</p>
<p style="color:#7A7F99;font-size:13px">Requested ${escapeHtml(when)} IST from ${escapeHtml(device)}${ip ? ` (IP ${escapeHtml(ip)})` : ''}.
If this wasn't you, someone knows your password — change it right away.</p></div>`,
    text: `Your ${businessName} owner sign-in code is ${code}. It expires in ${mins} minutes. If this wasn't you, change your password now.`,
  };
}

