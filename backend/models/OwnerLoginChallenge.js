import mongoose from 'mongoose';

// One row per pending owner sign-in (email code step). MongoDB purges rows automatically after they expire.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    idHash: { type: String, required: true, unique: true }, // sha256 of the opaque id the browser holds
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    resends: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 }); // kept an hour past expiry, then purged

export default mongoose.model('OwnerLoginChallenge', schema);
