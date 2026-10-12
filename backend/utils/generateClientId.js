import User from '../models/User.js';

// e.g. CX-2026-001, CX-2026-002 — sequential per year
const generateClientId = async () => {
  const year = new Date().getFullYear();
  const count = await User.countDocuments({ clientId: { $regex: `^CX-${year}-` } });
  const seq = String(count + 1).padStart(3, '0');
  return `CX-${year}-${seq}`;
};

export default generateClientId;
