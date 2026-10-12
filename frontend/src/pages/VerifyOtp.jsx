import { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import '../styles/theme.css';

export default function VerifyOtp() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [digits, setDigits] = useState(Array(6).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const inputsRef = useRef([]);

  // arrived here directly without signing up first — send them back
  if (!state?.userId) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p className="muted">No signup in progress. Please sign up first.</p>
          <a className="btn" href="/signup" style={{ display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
            Go to sign up
          </a>
        </div>
      </div>
    );
  }

  const handleChange = (i, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits];
    next[i] = val;
    setDigits(next);
    if (val && inputsRef.current[i + 1]) inputsRef.current[i + 1].focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && inputsRef.current[i - 1]) {
      inputsRef.current[i - 1].focus();
    }
  };

  const handleVerify = async () => {
    setError('');
    setInfo('');
    const otp = digits.join('');
    if (otp.length !== 6) {
      setError('Enter all 6 digits.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { userId: state.userId, otp });
      navigate('/pending-approval');
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await api.post('/auth/resend-otp', { userId: state.userId });
      setInfo('A new OTP has been sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not resend OTP');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="brand" style={{ justifyContent: 'center' }}>
          <div className="mark">CX</div>
          <div className="name">Verify your email</div>
        </div>
        <p className="otp-sub">
          We sent a 6-digit code to <b>{state.email}</b>.
        </p>

        <div className="otp-row">
          {digits.map((d, i) => (
            <input
              key={i}
              className="otp-digit"
              maxLength={1}
              inputMode="numeric"
              value={d}
              ref={(el) => (inputsRef.current[i] = el)}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
            />
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}
        {info && <p className="info-text">{info}</p>}

        <div className="foot-note" style={{ marginTop: 6 }}>
          Didn't get it?{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); handleResend(); }}>
            Resend OTP
          </a>
        </div>

        <button className="btn" onClick={handleVerify} disabled={loading}>
          {loading ? 'Verifying…' : 'Verify & continue'}
        </button>
      </div>
    </div>
  );
}
