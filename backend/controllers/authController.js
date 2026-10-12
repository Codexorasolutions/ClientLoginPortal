import crypto from 'crypto';
import User from '../models/User.js';
import generateOtp from '../utils/generateOtp.js';
import sendEmail from '../utils/sendEmail.js';
import generateToken from '../utils/generateToken.js';
import { generateResetToken } from '../utils/generateResetToken.js';
import { needsOwnerOtp, startOwnerChallenge } from '../utils/ownerOtp.js';
import { logAudit } from '../utils/audit.js';

const OTP_EXPIRY_MINUTES = 10;
const RESET_EXPIRY_MINUTES = 30;

const otpEmailHtml = (otp, heading) => `
  <div style="font-family:Arial,sans-serif;max-width:420px">
    <h2 style="color:#14161C">${heading}</h2>
    <p style="color:#6B7280">Use the code below to verify your email for the Codexora Portal.</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:8px;color:#14B8A6;margin:16px 0">${otp}</div>
    <p style="color:#6B7280;font-size:13px">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
  </div>
`;

// POST /api/auth/signup
export const signup = async (req, res) => {
  try {
    const { fullName, email, phone, password, businessName, businessType } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const otp = generateOtp();
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const user = await User.create({
      fullName,
      email,
      phone,
      password,
      businessName,
      businessType,
      // SECURITY: a public signup can only ever create a CLIENT. Owner accounts are made with
      // `npm run seed:owner` — never from a request body (that would let anyone sign up as owner).
      role: 'client',
      otp,
      otpExpires,
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'Verify your email — Codexora Portal',
        html: otpEmailHtml(otp, 'Verify your email'),
      });
    } catch (emailErr) {
      // roll back the account so the same email can be retried once email is fixed.
      // The exact reason (and how to fix it) goes to the server log; visitors get a calm, safe message.
      console.error('OTP email failed to send:', emailErr.hint || emailErr.message, emailErr.message);
      await User.deleteOne({ _id: user._id });
      return res.status(502).json({
        message:
          'Your details are fine, but we could not send the verification email right now. ' +
          'Please try again in a few minutes. If it keeps failing, contact Codexora Solutions.',
      });
    }

    res.status(201).json({
      message: 'Account created. OTP sent to email.',
      userId: user._id,
      email: user.email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Signup failed', error: err.message });
  }
};

// POST /api/auth/verify-otp
export const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }
    if (!user.otp || user.otp !== otp) {
      return res.status(400).json({ message: 'Incorrect OTP' });
    }
    if (user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'OTP expired, please request a new one' });
    }

    user.isEmailVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({
      message: 'Email verified. Your request is now awaiting owner approval.',
      approvalStatus: user.approvalStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Verification failed', error: err.message });
  }
};

// POST /api/auth/resend-otp
export const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your new OTP — Codexora Portal',
        html: otpEmailHtml(otp, 'Your new verification code'),
      });
    } catch (emailErr) {
      console.error('Resend OTP email failed to send:', emailErr.hint || emailErr.message, emailErr.message);
      return res.status(502).json({
        message: 'We could not send the email right now. Please try again in a few minutes.',
      });
    }

    res.json({ message: 'A new OTP has been sent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not resend OTP', error: err.message });
  }
};

// the exact JSON a successful sign-in returns — shared with the owner email-code step
export const loginPayload = (user) => ({
  token: generateToken(user),
  user: {
    id: user._id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    businessName: user.businessName,
    clientId: user.clientId,
  },
});

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password, loginAs } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (user.role === 'owner') {
        await logAudit(req, 'auth.login_failed', { actor: { email: user.email, fullName: user.fullName, role: 'owner' }, summary: 'Wrong password for the owner account' });
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // the Client/Owner tab picked on the login screen — refuse here, before any token or code is issued
    if ((loginAs === 'owner' || loginAs === 'client') && loginAs !== user.role) {
      return res.status(403).json({
        message: `This account is registered as ${user.role === 'owner' ? 'an Owner' : 'a Client'}. Switch to the "${user.role === 'owner' ? 'Owner' : 'Client'}" tab above to sign in.`,
      });
    }

    // email verification and the approval workflow only apply to clients —
    // owner accounts are created directly (seed script or by another owner)
    // and were never meant to be gated by either check
    if (user.role === 'client') {
      if (!user.isEmailVerified) {
        return res.status(403).json({ message: 'Please verify your email before signing in.' });
      }
      if (user.approvalStatus === 'pending') {
        return res.status(403).json({ message: 'Your request is still awaiting owner approval.' });
      }
      if (user.approvalStatus === 'rejected') {
        return res.status(403).json({ message: 'Your access request was not approved. Contact Codexora support.' });
      }
    }

    // owners confirm with a code emailed to them (turn off in an emergency with OWNER_2FA=off)
    if (needsOwnerOtp(user)) {
      return res.json(await startOwnerChallenge(req, user));
    }
    if (user.role === 'owner') {
      await logAudit(req, 'auth.login', { actor: user, summary: 'Owner signed in (email code is switched off)' });
    }

    res.json(loginPayload(user));
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message }); // e.g. code email could not be sent
    console.error(err);
    res.status(500).json({ message: 'Login failed', error: err.message });
  }
};

// POST /api/auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = email ? await User.findOne({ email: email.toLowerCase() }) : null;

    // respond the same way whether or not the account exists, so we don't
    // reveal which emails are registered
    if (user) {
      const { rawToken, hashedToken } = generateResetToken();
      user.resetToken = hashedToken;
      user.resetTokenExpires = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);
      await user.save();

      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}&id=${user._id}`;

      await sendEmail({
        to: user.email,
        subject: 'Reset your Codexora Portal password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:420px">
            <h2 style="color:#14161C">Reset your password</h2>
            <p style="color:#6B7280">Click the link below to set a new password. This link expires in ${RESET_EXPIRY_MINUTES} minutes.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#14B8A6;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;margin-top:10px">Reset password</a>
            <p style="color:#6B7280;font-size:13px;margin-top:16px">If you didn't request this, you can ignore this email.</p>
          </div>
        `,
      });
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not process request', error: err.message });
  }
};

// POST /api/auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { id, token, newPassword } = req.body;
    if (!id || !token || !newPassword) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      _id: id,
      resetToken: hashedToken,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: 'This reset link is invalid or has expired' });
    }

    user.password = newPassword; // pre-save hook re-hashes it
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    await user.save();
    await logAudit(req, 'auth.password_changed', { actor: user, summary: 'Password reset via emailed link' });

    res.json({ message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not reset password', error: err.message });
  }
};
