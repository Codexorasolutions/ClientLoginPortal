// Pure rules for account status, who may be managed, and password strength. No database access.

export const STATUSES = ['pending', 'active', 'suspended', 'terminated', 'rejected'];
export const STATUS_LABELS = { pending: 'Pending', active: 'Active', suspended: 'Suspended', terminated: 'Terminated', rejected: 'Rejected' };

const suspensionOver = (user, now) => user.accessStatus === 'suspended' && user.suspendedUntil && new Date(user.suspendedUntil) <= now;

// What the owner sees. Precedence: terminated > suspended > rejected > pending > active.
// Owners are never pending/rejected. A suspension whose end date has passed counts as active.
export function effectiveStatus(user, now = new Date()) {
  if (user.accessStatus === 'terminated') return 'terminated';
  if (user.accessStatus === 'suspended' && !suspensionOver(user, now)) return 'suspended';
  if (user.role === 'owner') return 'active';
  if (user.approvalStatus === 'rejected') return 'rejected';
  if (user.approvalStatus === 'pending') return 'pending';
  return 'active';
}

export const isSuspensionOver = suspensionOver;

// Should this account be turned away right now? Returns null (let in) or { status, code, message }.
export function accessBlock(user, now = new Date()) {
  if (user.accessStatus === 'terminated') {
    return { status: 403, code: 'account_terminated', message: 'Your account has been terminated. Contact Codexora Solutions.' };
  }
  if (user.accessStatus === 'suspended' && !suspensionOver(user, now)) {
    return { status: 403, code: 'account_suspended', message: 'Your account has been suspended. Contact Codexora Solutions.' };
  }
  return null;
}

// Owner accounts (and the signed-in owner themselves) can never be suspended, terminated or deleted from the Users tab.
export function canManage(actor, target) {
  if (!target) return { ok: false, status: 404, message: 'User not found' };
  if (String(actor?._id) === String(target._id)) return { ok: false, status: 403, message: 'You cannot suspend, terminate or delete your own account.' };
  if (target.role !== 'client') return { ok: false, status: 403, message: 'Owner accounts cannot be suspended, terminated or deleted from here.' };
  return { ok: true };
}

// ---- password strength (shared rule for the owner's own password and temporary passwords) ----
export function passwordStrength(pw = '') {
  const issues = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Za-z]/.test(pw)) issues.push('a letter');
  if (!/\d/.test(pw)) issues.push('a number');
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui)/i.test(pw)) score = Math.min(score, 1);
  return { ok: issues.length === 0, issues, score: Math.min(4, score) }; // 0 (weak) … 4 (strong)
}

export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
