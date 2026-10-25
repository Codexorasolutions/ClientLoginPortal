import Notification from '../models/Notification.js';
import User from '../models/User.js';

// creates a notification for one specific user, unless they've turned
// bell notifications off in Settings (notificationsEnabled defaults to
// true, so a user created before this field existed still gets notified)
export const notifyUser = async (recipientId, { title, message, type }) => {
  const recipient = await User.findById(recipientId).select('notificationsEnabled');
  if (!recipient || recipient.notificationsEnabled === false) return null;
  return Notification.create({ recipient: recipientId, title, message, type });
};

// creates the same notification for every owner who hasn't muted
// notifications — used for events the business owner should hear about
// (new ticket, new reply, new lead)
export const notifyOwners = async ({ title, message, type }) => {
  const owners = await User.find({ role: 'owner', notificationsEnabled: { $ne: false } }).select('_id preferences');
  // My Account → Preferences lets each owner mute individual kinds (ticket / lead / approval); unset = on
  const wanted = owners.filter((owner) => owner.preferences?.notifyTypes?.[type] !== false);
  return Promise.all(
    wanted.map((owner) => Notification.create({ recipient: owner._id, title, message, type }))
  );
};
