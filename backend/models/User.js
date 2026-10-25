import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['client', 'owner'], default: 'client', required: true },

    // business/client details
    businessName: { type: String, trim: true },
    businessType: {
      type: String,
      enum: ['School', 'Clinic', 'Shop', 'Restaurant', 'Other'],
      default: 'Other',
    },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6 },

    // signup email verification (built in Module 2)
    isEmailVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpires: { type: Date },

    // owner-approval workflow (built in Module 4)
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // forgot/reset password (built in Module 5)
    resetToken: { type: String },
    resetTokenExpires: { type: Date },

    // assigned once approved, e.g. CX-2026-014
    clientId: { type: String, unique: true, sparse: true },

    // Settings toggle (built in the Profile/Settings step): when false,
    // notify* calls skip creating a bell notification for this user —
    // the activity feed and every dashboard number stay accurate either way,
    // this only mutes the bell/unread badge.
    notificationsEnabled: { type: Boolean, default: true },

    // ---- account access control (Users tab) ----
    // Approval (pending/approved/rejected) is unchanged. This is a SECOND, independent switch the owner can flip
    // on an approved account. Accounts created before this field existed have none = treated as 'active'.
    accessStatus: { type: String, enum: ['active', 'suspended', 'terminated'], default: 'active' },
    statusReason: { type: String, trim: true, maxlength: 300 },
    suspendedAt: Date,
    suspendedUntil: Date, // optional auto-reactivate date
    terminatedAt: Date,
    statusHistory: [
      {
        _id: false,
        status: { type: String }, // approved | rejected | suspended | reactivated | terminated | restored | auto-reactivated
        reason: { type: String, maxlength: 300 },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byName: String,
        until: Date,
        at: { type: Date, default: Date.now },
      },
    ],
    // Bumped to sign a user out of EVERY device: tokens carry the number they were issued with, and
    // the auth middleware rejects any token whose number no longer matches.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    ownerNotes: { type: String, maxlength: 2000 }, // private notes — never returned by any client-facing route

    // ---- owner's own account (My Account tab) ----
    designation: { type: String, trim: true, maxlength: 60 },
    avatarUrl: { type: String, trim: true },
    avatarPublicId: { type: String, select: false },
    twoFactorEnabled: { type: Boolean }, // owner only; undefined = ON (the safe default)
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'] },
      dateFormat: { type: String, enum: ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] },
      notifyTypes: {
        ticket: { type: Boolean },
        lead: { type: Boolean },
        approval: { type: Boolean },
      },
    },

    // email change in progress (secrets are select:false, so no query returns them unless explicitly asked)
    pendingEmail: { type: String, lowercase: true, trim: true, select: false },
    pendingEmailOtpHash: { type: String, select: false },
    pendingEmailExpires: { type: Date, select: false },
    pendingEmailAttempts: { type: Number, select: false },
    pendingEmailSentAt: { type: Date, select: false },
  },
  { timestamps: true }
);

// hash password automatically whenever it's set/changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);
