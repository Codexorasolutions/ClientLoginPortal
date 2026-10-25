import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { accessBlock } from '../utils/userStatus.js';
import { autoReactivateIfDue } from '../utils/suspension.js';

// Verifies the JWT and attaches req.user. Runs on EVERY protected request, so an owner's decision
// (suspend, terminate, sign out everywhere) takes effect immediately — not at the user's next login.
const protect = async (req, res, next) => {
  let token;
  const header = req.headers.authorization;

  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided', code: 'no_token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists', code: 'session_revoked' });
    }

    // a suspension with an end date reactivates itself the first time the user comes back after it
    await autoReactivateIfDue(user);

    // suspended / terminated: a clear 403 (checked BEFORE the session check, so the person is told why, not just "signed out")
    const blocked = accessBlock(user);
    if (blocked) return res.status(blocked.status).json({ message: blocked.message, code: blocked.code });

    // signed out everywhere (force-logout, password change, a suspension that has since been lifted, ...)
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'You were signed out. Please sign in again.', code: 'session_revoked' });
    }

    req.user = user;
    req.sessionId = decoded.sid;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, invalid or expired token', code: 'token_invalid' });
  }
};

export default protect;
