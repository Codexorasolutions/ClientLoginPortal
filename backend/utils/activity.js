import Activity from '../models/Activity.js';

// logs one entry to a client's activity feed — separate from
// Notification (which drives the bell/unread count): this is a permanent,
// visible timeline, notifications are a transient "you have something new"
export const logActivity = (clientId, type, message) => {
  return Activity.create({ client: clientId, type, message });
};
