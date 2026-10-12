import User from '../models/User.js';
import { logAudit } from '../utils/audit.js';

const BUSINESS_TYPES = ['School', 'Clinic', 'Shop', 'Restaurant', 'Other'];

const toProfile = (user) => ({
  fullName: user.fullName,
  email: user.email,
  phone: user.phone || '',
  businessName: user.businessName || '',
  businessType: user.businessType,
  role: user.role,
  clientId: user.clientId,
  notificationsEnabled: user.notificationsEnabled,
});

// GET /api/profile — works for either role, since Settings is shared
export const getProfile = (req, res) => {
  res.json({ profile: toProfile(req.user) });
};

// PATCH /api/profile — business info + notification toggle.
// Email is intentionally NOT editable here — changing it would need its
// own re-verification flow, same as signup, so that's out of scope for now.
export const updateProfile = async (req, res) => {
  try {
    const { fullName, phone, businessName, businessType, notificationsEnabled } = req.body;

    if (fullName !== undefined && !fullName.trim()) {
      return res.status(400).json({ message: 'Full name cannot be empty' });
    }
    if (businessType !== undefined && !BUSINESS_TYPES.includes(businessType)) {
      return res.status(400).json({ message: `Business type must be one of: ${BUSINESS_TYPES.join(', ')}` });
    }

    const user = await User.findById(req.user._id);
    if (fullName !== undefined) user.fullName = fullName.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (businessName !== undefined) user.businessName = businessName.trim();
    if (businessType !== undefined) user.businessType = businessType;
    if (notificationsEnabled !== undefined) user.notificationsEnabled = !!notificationsEnabled;
    await user.save();

    res.json({ message: 'Profile updated', profile: toProfile(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update profile', error: err.message });
  }
};

// PATCH /api/profile/password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    // req.user came from the auth middleware with -password, so re-fetch
    // the full document to actually check the current password
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    user.password = newPassword; // pre-save hook re-hashes it
    await user.save();
    await logAudit(req, 'auth.password_changed', { actor: user, summary: 'Password changed from Settings' });

    res.json({ message: 'Password updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not change password', error: err.message });
  }
};
