import express from 'express';
import protect from '../middleware/auth.js';
import roleGuard from '../middleware/roleGuard.js';
import captchaGuard from '../middleware/captchaGuard.js';
import {
  signup,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import { verifyOwnerLogin, resendOwnerLoginCode } from '../controllers/ownerTwoFactorController.js';

const router = express.Router();

// --- Modules 2 + 3: signup + OTP, CAPTCHA-protected ---
router.post('/signup', captchaGuard, signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// --- Module 5: login + forgot/reset password, CAPTCHA-protected ---
router.post('/login', captchaGuard, login);
// owner sign-in step 2: the 6-digit code emailed after the password is accepted. No captcha here —
// the challenge id (issued only after password + captcha) is the proof, and wrong codes are capped per challenge.
router.post('/owner-2fa/verify', verifyOwnerLogin);
router.post('/owner-2fa/resend', resendOwnerLoginCode);
router.post('/forgot-password', captchaGuard, forgotPassword);
router.post('/reset-password', resetPassword); // already gated by the emailed token, no captcha needed

// --- Module 1 leftovers: prove token + role guard still work ---
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

router.get('/owner-only', protect, roleGuard('owner'), (req, res) => {
  res.json({ message: 'You are an approved owner.' });
});

export default router;
