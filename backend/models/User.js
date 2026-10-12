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
