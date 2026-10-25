import jwt from 'jsonwebtoken';

// `tv` (token version) lets the owner sign a user out everywhere: bump user.tokenVersion and every older token stops working.
// `sid` is the LoginEvent this token belongs to, so "My Account → Sessions" can mark the current device.
const generateToken = (user, sessionId) => {
  return jwt.sign(
    { id: user._id, role: user.role, tv: user.tokenVersion || 0, ...(sessionId && { sid: String(sessionId) }) },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

export default generateToken;
