import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import Captcha from '../components/Captcha.jsx';
import '../styles/theme.css';

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    businessName: '',
    businessType: 'School',
    fullName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [captchaToken, setCaptchaToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!captchaToken) {
      setError('Please complete the CAPTCHA.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/signup', { ...form, captchaToken, role: 'client' });
      navigate('/verify-otp', { state: { userId: data.userId, email: data.email } });
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <div className="mark">CX</div>
          <div className="name">Request access</div>
        </div>
        <p className="muted" style={{ marginTop: -14 }}>
          Tell us about your business. Codexora reviews every request before granting portal access.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Business name</label>
          <input name="businessName" value={form.businessName} onChange={handleChange} placeholder="e.g. Shanti Public School" required />

          <label>Business type</label>
          <select name="businessType" value={form.businessType} onChange={handleChange}>
            <option>School</option>
            <option>Clinic</option>
            <option>Shop</option>
            <option>Restaurant</option>
            <option>Other</option>
          </select>

          <label>Your name</label>
          <input name="fullName" value={form.fullName} onChange={handleChange} placeholder="Full name" required />

          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="you@yourbusiness.com" required />

          <label>Phone</label>
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="10-digit mobile number" />

          <label>Set a password</label>
          <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="••••••••" minLength={6} required />

          <Captcha onChange={setCaptchaToken} />

          {error && <p className="error-text">{error}</p>}

          <button className="btn" disabled={loading}>
            {loading ? 'Sending OTP…' : 'Continue — send OTP'}
          </button>
        </form>

        <div className="foot-note">
          Already approved? <a href="/login">Sign in</a>
        </div>
      </div>
    </div>
  );
}
