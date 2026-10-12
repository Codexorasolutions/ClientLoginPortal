import axios from 'axios';

// verifies a reCAPTCHA v2 token against Google's siteverify endpoint
const verifyCaptcha = async (token) => {
  if (!token) return false;

  try {
    const { data } = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      { params: { secret: process.env.RECAPTCHA_SECRET_KEY, response: token } }
    );
    return data.success === true;
  } catch (err) {
    console.error('reCAPTCHA verification error:', err.message);
    return false;
  }
};

export default verifyCaptcha;
