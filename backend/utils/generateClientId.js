import User from '../models/User.js';

// e.g. CX-2026-001, CX-2026-002 — sequential per year.
// Uses the HIGHEST number already issued (not a head-count), so deleting a client can never make the next
// person receive an ID that another client still has.
const generateClientId = async () => {
  const year = new Date().getFullYear();
  const existing = await User.find({ clientId: { $regex: `^CX-${year}-` } }).select('clientId');
  const highest = existing.reduce((max, u) => {
    const n = parseInt(String(u.clientId).split('-')[2], 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `CX-${year}-${String(highest + 1).padStart(3, '0')}`;
};

export default generateClientId;
