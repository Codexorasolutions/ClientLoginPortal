import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import Captcha from '../components/Captcha.jsx';
import OwnerOtpStep from '../components/OwnerOtpStep.jsx';
import '../styles/theme.css';
import '../styles/owner-tools.css';

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState('client'); // which tab is selected: 'client' | 'owner'
  const [form, setForm] = useState({ email: '', password: '' });
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null); // set when the owner must enter the emailed code

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // shared by the normal sign-in and the owner email-code step
  const finishLogin = (data) => {
    localStorage.setItem('cx_token', data.token);
    localStorage.setItem('cx_user', JSON.stringify(data.user));
    navigate(data.user.role === 'owner' ? '/owner/dashboard' : '/client/dashboard');
  };

  const backToPassword = () => {
    setChallenge(null);
    setCaptchaToken(''); // the CAPTCHA widget is rebuilt when the form comes back, and each token works only once
    setForm((f) => ({ ...f, password: '' }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!captchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { ...form, captchaToken, loginAs: role });

      // owner accounts: the password was right, now a 6-digit code has been emailed
      if (data.twoFactorRequired) {
        setChallenge(data);
        return;
      }

      // enforce the section the user picked — a client account can't sign
      // in through the Owner tab and vice versa
      if (data.user.role !== role) {
        setError(`This account is registered as ${data.user.role === 'owner' ? 'an Owner' : 'a Client'}. Switch to the "${data.user.role === 'owner' ? 'Owner' : 'Client'}" tab above to sign in.`);
        setLoading(false);
        return;
      }

      finishLogin(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <div className="mark">CX</div>
          <div className="name">Codexora Portal</div>
        </div>

        {challenge ? (
          <OwnerOtpStep challenge={challenge} onVerified={finishLogin} onBack={backToPassword} />
        ) : (
        <>
        <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 999, padding: 3, marginBottom: 24, background: 'var(--paper)' }}>
          {['client', 'owner'].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRole(r); setError(''); }}
              style={{
                flex: 1, border: 0, borderRadius: 999, padding: 9,
                font: '600 13px Inter', cursor: 'pointer',
                background: role === r ? 'var(--indigo)' : 'transparent',
                color: role === r ? '#fff' : 'var(--ink-soft)',
              }}
            >
              {r === 'client' ? 'Client' : 'Owner'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@yourbusiness.com" required />

          <div className="field-row">
            <label style={{ margin: '16px 0 0' }}>Password</label>
            <a href="/forgot-password">Forgot password?</a>
          </div>
          <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" style={{ marginTop: 6 }} required />

          <Captcha onChange={setCaptchaToken} />

          {error && <p className="error-text">{error}</p>}

          <button className="btn" disabled={loading}>
            {loading ? 'Signing in…' : `Sign in as ${role === 'client' ? 'Client' : 'Owner'}`}
          </button>
        </form>
        </>
        )}

        <div className="foot-note">
          New client? <a href="/signup">Request access</a>
        </div>
      </div>
    </div>
  );
}
