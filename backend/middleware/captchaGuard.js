import verifyCaptcha from '../utils/verifyCaptcha.js';

// blocks the request unless a valid reCAPTCHA token was submitted;
// drop this in front of any route that needs CAPTCHA protection
// (signup now, login + forgot-password once those routes exist in Module 5)
const captchaGuard = async (req, res, next) => {
  const { captchaToken } = req.body;
  const passed = await verifyCaptcha(captchaToken);

  if (!passed) {
    return res.status(400).json({ message: 'CAPTCHA verification failed. Please try again.' });
  }
  next();
};

export default captchaGuard;
