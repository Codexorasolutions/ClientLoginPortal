import nodemailer from 'nodemailer';

// Built lazily (only when sendEmail is actually called), not at module
// load time. This guarantees process.env is always fully populated by
// then, regardless of import order elsewhere in the app — the earlier
// bug (SMTP connecting to localhost instead of Gmail) happened because
// this used to build the transporter as soon as the file was imported,
// before .env had necessarily been loaded yet.
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for 587/2525
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error(
      'SMTP is not configured — SMTP_HOST, SMTP_USER, and SMTP_PASS must all be set in backend/.env'
    );
  }

  await getTransporter().sendMail({
    from: `"Codexora Solutions" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
};

export default sendEmail;
