import { useState } from 'react';
import api from '../api/axios.js';

const BUSINESS_TYPES = ['School', 'Clinic', 'Shop', 'Restaurant', 'Other'];

// Business info + notification toggle + password change. Shared by both
// roles — business fields only render for clients (an owner account has
// no "business" of its own).
export default function SettingsPanel({ profile, onUpdated }) {
  const isClient = profile.role === 'client';

  const [form, setForm] = useState({
    fullName: profile.fullName || '',
    phone: profile.phone || '',
    businessName: profile.businessName || '',
    businessType: profile.businessType || 'Other',
    notificationsEnabled: profile.notificationsEnabled !== false,
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileErr('');
    setSavingProfile(true);
    try {
      const body = { fullName: form.fullName, phone: form.phone, notificationsEnabled: form.notificationsEnabled };
      if (isClient) {
        body.businessName = form.businessName;
        body.businessType = form.businessType;
      }
      const { data } = await api.patch('/profile', body);
      setProfileMsg('Saved.');
      onUpdated?.(data.profile);
    } catch (err) {
      setProfileErr(err.response?.data?.message || 'Could not save changes');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErr('New passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      await api.patch('/profile/password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg('Password updated.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwErr(err.response?.data?.message || 'Could not change password');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <div className="panel" style={{ marginBottom: 22 }}>
        <h3 className="section-title">Business info</h3>
        <form onSubmit={saveProfile}>
          <div className="form-row">
            <div>
              <label>Full name</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          {isClient && (
            <div className="form-row">
              <div>
                <label>Business name</label>
                <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
              </div>
              <div>
                <label>Business type</label>
                <select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
                  {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="form-row">
            <div>
              <label>Email (contact support to change)</label>
              <input value={profile.email} disabled />
            </div>
          </div>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={form.notificationsEnabled}
              onChange={(e) => setForm({ ...form, notificationsEnabled: e.target.checked })}
            />
            <span className="toggle-switch" aria-hidden="true"></span>
            <span>Notify me about approvals, project updates, invoices, and ticket replies</span>
          </label>

          {profileErr && <p className="error-text">{profileErr}</p>}
          {profileMsg && <p className="info-text">{profileMsg}</p>}
          <button className="btn-sm primary" disabled={savingProfile} style={{ marginTop: 14 }}>
            {savingProfile ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h3 className="section-title">Change password</h3>
        <form onSubmit={changePassword}>
          <div className="form-row">
            <div style={{ flex: '1 1 100%' }}>
              <label>Current password</label>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div>
              <label>New password</label>
              <input
                type="password"
                minLength={6}
                value={pwForm.newPassword}
                onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Confirm new password</label>
              <input
                type="password"
                minLength={6}
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                required
              />
            </div>
          </div>
          {pwErr && <p className="error-text">{pwErr}</p>}
          {pwMsg && <p className="info-text">{pwMsg}</p>}
          <button className="btn-sm primary" disabled={savingPw} style={{ marginTop: 6 }}>
            {savingPw ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </>
  );
}
