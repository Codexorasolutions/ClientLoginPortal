import { resendOwnerCode, verifyOwnerCode } from '../utils/ownerOtp.js';
import { logAudit } from '../utils/audit.js';
import { loginPayload } from './authController.js';

const send = (res, err) =>
  res.status(err.status || 500).json({
    message: err.status ? err.message : 'Something went wrong. Try again.',
    code: err.code,
    attemptsLeft: err.attemptsLeft,
  });

// POST /api/auth/owner-2fa/verify  { challengeId, code }  ->  same JSON as a normal login
export const verifyOwnerLogin = async (req, res) => {
  const { challengeId } = req.body || {};
  const code = String(req.body?.code || '').replace(/\s/g, '');
  if (typeof challengeId !== 'string' || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 6-digit code from your email.', code: 'bad_input' });
  }
  try {
    const user = await verifyOwnerCode(challengeId, code);
    await logAudit(req, 'auth.login', { actor: user, summary: 'Owner signed in (email code verified)' });
    res.json(await loginPayload(user, req));
  } catch (err) {
    if (err.code === 'wrong_code') await logAudit(req, 'auth.2fa_failed', { actor: err.user, summary: `Wrong sign-in code (${err.attemptsLeft} tries left)` });
    if (err.code === 'locked') await logAudit(req, 'auth.2fa_locked', { actor: err.user, summary: 'Sign-in locked after too many wrong codes' });
    if (!err.status) console.error(err);
    send(res, err);
  }
};

// POST /api/auth/owner-2fa/resend  { challengeId }
export const resendOwnerLoginCode = async (req, res) => {
  if (typeof req.body?.challengeId !== 'string') return res.status(400).json({ message: 'Sign in again.', code: 'bad_input' });
  try {
    res.json(await resendOwnerCode(req, req.body.challengeId));
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err);
  }
};
