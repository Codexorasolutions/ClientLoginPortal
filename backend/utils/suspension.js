import User from '../models/User.js';
import { isSuspensionOver } from './userStatus.js';

// A suspension with an end date lifts itself the first time the user shows up after it. Returns true if it just did.
export async function autoReactivateIfDue(user, now = new Date()) {
  if (!isSuspensionOver(user, now)) return false;
  await User.updateOne(
    { _id: user._id, accessStatus: 'suspended' },
    {
      $set: { accessStatus: 'active' },
      $unset: { suspendedUntil: 1, suspendedAt: 1, statusReason: 1 },
      $push: { statusHistory: { status: 'auto-reactivated', reason: 'Suspension period ended', at: now } },
    }
  );
  user.accessStatus = 'active';
  user.suspendedUntil = undefined;
  return true;
}
