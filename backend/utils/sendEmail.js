import nodemailer from 'nodemailer';
import axios from 'axios';

// Two ways to send, chosen by environment variables (read at call time, so .env is always loaded by then):
//   1. BREVO_API_KEY set  -> Brevo's HTTPS API. Works on hosts that BLOCK SMTP ports (e.g. Render free web services).
//   2. otherwise          -> SMTP via nodemailer (Gmail etc.), exactly as before.
// Every failure is thrown as an EmailError with a plain-English `.hint` (what is wrong and how to fix it).

export class EmailError extends Error {
  constructor(message, { hint, provider, code, status } = {}) {
    super(message);
    this.name = 'EmailError';
    this.hint = hint;
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

const BLOCKED_CODES = ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EDNS', 'ENOTFOUND', 'ECONNRESET'];

export const emailProvider = () => {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return 'smtp';
  return 'none';
};

const fromAddress = () => process.env.EMAIL_FROM || process.env.SMTP_USER;
const fromName = () => process.env.EMAIL_FROM_NAME || 'Codexora Solutions';

// ---------- plain-English explanations ----------
export function explainSmtpError(err) {
  const msg = String(err?.message || err);
  if (BLOCKED_CODES.includes(err?.code) || /Greeting never received|Connection timeout|timed out/i.test(msg)) {
    return 'The server could not connect to the mail server. Many hosts block SMTP ports 25/465/587 — Render blocks them on FREE web services. ' +
      'Fix: set BREVO_API_KEY (and EMAIL_FROM) to send through an HTTPS email API, or move the backend to a paid plan.';
  }
  if (err?.code === 'EAUTH' || err?.responseCode === 535 || /Invalid login|Username and Password not accepted/i.test(msg)) {
    return 'The mail server rejected the login. For Gmail, SMTP_USER must be the Gmail address and SMTP_PASS a 16-character App Password (2-Step Verification must be on) — not the normal password.';
  }
  if (err?.responseCode === 550 || err?.responseCode === 553) {
    return 'The mail server refused this message or sender address. Check that SMTP_USER is a real mailbox and the recipient address is valid.';
  }
  return `The mail server returned an error: ${msg}`;
}

export function explainBrevoError(err) {
  const status = err?.response?.status;
  const detail = err?.response?.data?.message || err?.message || '';
  if (!err?.response) {
    return BLOCKED_CODES.includes(err?.code) || /timeout/i.test(String(err?.message))
      ? 'The server could not reach api.brevo.com (network or timeout). Check the host\'s outbound internet access and try again.'
      : `Could not call the Brevo API: ${detail}`;
  }
  if (status === 401) return 'Brevo rejected the API key. Check BREVO_API_KEY (it starts with xkeysib-). If the key is right, open Brevo → Security → Authorised IPs and deactivate the restriction — your host\'s IP address changes.';
  if (status === 400 && /sender/i.test(detail)) return 'Brevo does not accept the sender address. Add EMAIL_FROM under Brevo → Senders, Domains & Dedicated IPs → Senders, and verify it.';
  if (status === 400) return `Brevo refused the message: ${detail}`;
  if (status === 403) return `Brevo says this account or key is not allowed to send: ${detail}`;
  if (status === 429) return 'Brevo\'s sending limit was reached (the free plan allows about 300 emails a day). Try again later.';
  return `Brevo returned an error (${status}): ${detail}`;
}

// ---------- providers ----------
let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587/2525
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // fail in seconds instead of hanging for minutes when the host blocks SMTP
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
};

const sendViaBrevo = async ({ to, subject, html, text }) => {
  const sender = fromAddress();
  if (!sender) throw new EmailError('EMAIL_FROM is not set', { provider: 'brevo', hint: 'Set EMAIL_FROM to the sender address you verified in Brevo.' });
  try {
    await axios.post(
      process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email',
      { sender: { name: fromName(), email: sender }, to: [{ email: to }], subject, htmlContent: html, ...(text && { textContent: text }) },
      { headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' }, timeout: 15000 }
    );
  } catch (err) {
    throw new EmailError(`Brevo send failed: ${err?.response?.data?.message || err.message}`, {
      provider: 'brevo', hint: explainBrevoError(err), code: err.code, status: err?.response?.status,
    });
  }
};

const sendViaSmtp = async ({ to, subject, html, text }) => {
  try {
    await getTransporter().sendMail({ from: `"${fromName()}" <${fromAddress()}>`, to, subject, html, ...(text && { text }) });
  } catch (err) {
    throw new EmailError(`SMTP send failed: ${err.message}`, { provider: 'smtp', hint: explainSmtpError(err), code: err.code || String(err.responseCode || '') });
  }
};

const sendEmail = async ({ to, subject, html, text }) => {
  const provider = emailProvider();
  if (provider === 'none') {
    throw new EmailError('Email is not configured', {
      provider, hint: 'Set BREVO_API_KEY + EMAIL_FROM (recommended on Render free), or SMTP_HOST + SMTP_USER + SMTP_PASS, in the backend environment variables.',
    });
  }
  return provider === 'brevo' ? sendViaBrevo({ to, subject, html, text }) : sendViaSmtp({ to, subject, html, text });
};

export default sendEmail;
