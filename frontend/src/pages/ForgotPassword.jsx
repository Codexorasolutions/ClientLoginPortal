import { useState } from 'react';
import Captcha from '../components/Captcha.jsx';
import api from '../api/axios.js';
import '../styles/theme.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!captchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email, captchaToken });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="brand" style={{ justifyContent: 'center' }}>
            <div className="mark">CX</div>
            <div className="name">Check your email</div>
          </div>
          <p className="muted">
            If <b>{email}</b> is registered, a reset link has been sent. It expires in 30 minutes.
          </p>
          <a className="btn ghost" href="/login" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <div className="mark">CX</div>
          <div className="name">Reset password</div>
        </div>

        <p className="muted" style={{ marginTop: -14 }}>
          Enter the email on your account. We'll send a reset link to your registered email.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Registered email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" required />

          <Captcha onChange={setCaptchaToken} />

          {error && <p className="error-text">{error}</p>}

          <button className="btn" disabled={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div className="foot-note">
          Remembered it? <a href="/login">Back to sign in</a>
        </div>
      </div>
    </div>
  );
}
