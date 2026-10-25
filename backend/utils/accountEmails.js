// Account emails that more than one controller needs. Moved here so the owner's "Resend verification" and
// "Send reset link" buttons use exactly the same emails the normal flows send.
import User from '../models/User.js';
import sendEmail from './sendEmail.js';
import generateOtp from './generateOtp.js';
import { generateResetToken } from './generateResetToken.js';

export const OTP_EXPIRY_MINUTES = 10;
export const RESET_EXPIRY_MINUTES = 30;

export const otpEmailHtml = (otp, heading) => `
  <div style="font-family:Arial,sans-serif;max-width:420px">
    <h2 style="color:#14161C">${heading}</h2>
    <p style="color:#6B7280">Use the code below to verify your email for the Codexora Portal.</p>
    <div style="font-size:28px;font-weight:700;letter-spacing:8px;color:#14B8A6;margin:16px 0">${otp}</div>
    <p style="color:#6B7280;font-size:13px">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, you can ignore this email.</p>
  </div>
`;

// new signup code for an unverified account, emailed to the account's own address
export async function sendVerificationOtp(user, heading = 'Your new verification code') {
  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await user.save();
  await sendEmail({ to: user.email, subject: 'Your new OTP — Codexora Portal', html: otpEmailHtml(otp, heading) });
}

// the same password-reset email the "Forgot password" page sends
export async function sendResetLink(user) {
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

export { User };
