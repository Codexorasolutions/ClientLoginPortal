// OwnerOtpStep.jsx — shown by your Login page when POST /auth/login answers { twoFactorRequired: true, ... }.
// Assumes an axios instance at ../api. Reuses your existing auth form classes where you like; styles are in owner-otp.css.
import { useEffect, useRef, useState } from 'react';
import api from '../api/axios.js';

export default function OwnerOtpStep({ challenge, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [dead, setDead] = useState(false);          // challenge is over (locked / expired) -> must sign in again
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(challenge.resendAfterSec || 60);
  const [info, setInfo] = useState('');
  const inputRef = useRef(null);
  const submitting = useRef(false);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setInfo('');
    try {
      const { data } = await api.post('/auth/owner-2fa/verify', { challengeId: challenge.challengeId, code: value });
      onVerified(data);                                  // { token, user } — handle exactly like your normal login success
    } catch (err) {
      const d = err.response?.data;
      setError(d?.message || 'Could not verify the code. Check your connection and try again.');
      if (d?.code === 'locked' || d?.code === 'invalid_challenge') setDead(true);
      setCode('');
      requestAnimationFrame(() => inputRef.current?.focus());
    } finally { submitting.current = false; setBusy(false); }
  };

  const onChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);   // also handles pasted "123 456"
    setCode(digits); setError('');
    if (digits.length === 6) verify(digits);
  };

  const resend = async () => {
    setError(''); setInfo('');
    try {
      const { data } = await api.post('/auth/owner-2fa/resend', { challengeId: challenge.challengeId });
      setWait(data.resendAfterSec || 60); setCode('');
      setInfo(data.resendsLeft > 0 ? 'New code sent. The old one no longer works.' : 'New code sent. This was the last resend.');
      inputRef.current?.focus();
    } catch (err) {
      const d = err.response?.data;
      setError(d?.message || 'Could not resend the code.');
      if (err.response?.status === 429) setWait(0);
    }
  };

  return (
    <div className="otp-step">
      <h2>Check your email</h2>
      <p className="otp-sub muted">We sent a 6-digit code to <strong>{challenge.maskedEmail}</strong>. It expires in {Math.round((challenge.expiresInSec || 600) / 60)} minutes.</p>

      <label htmlFor="owner-otp">Sign-in code</label>
      <input
        id="owner-otp" ref={inputRef} className="otp-input" value={code} onChange={onChange} disabled={busy || dead}
        inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} placeholder="••••••"
        aria-invalid={!!error} aria-describedby="owner-otp-msg"
      />
      <p id="owner-otp-msg" className={`otp-msg ${error ? 'err' : ''}`} role={error ? 'alert' : 'status'}>
        {busy ? 'Checking…' : error || info}
      </p>

      {dead ? (
        <button type="button" className="btn" onClick={onBack}>Back to sign in</button>
      ) : (
        <div className="otp-actions">
          <button type="button" className="otp-link" onClick={resend} disabled={wait > 0 || busy}>
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </button>
          <button type="button" className="otp-link" onClick={onBack}>Use a different account</button>
        </div>
      )}
    </div>
  );
}
