import mongoose from 'mongoose';

// One row per successful sign-in. Powers "login history" and "active sessions".
// `tokenVersion` records which generation of tokens the sign-in belongs to: once the user's
// tokenVersion moves on (force-logout, password change), the session is no longer active.
const loginEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ip: String,
    userAgent: { type: String, maxlength: 300 },
    tokenVersion: { type: Number, default: 0 },
    expiresAt: Date, // when the issued token stops working on its own
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
loginEventSchema.index({ user: 1, createdAt: -1 });
loginEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 }); // keep 6 months

export default mongoose.model('LoginEvent', loginEventSchema);
