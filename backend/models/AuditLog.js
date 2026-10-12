import mongoose from 'mongoose';

// Append-only: rows can be created and read, never edited or deleted through the app.
const auditSchema = new mongoose.Schema(
  {
    actor: { id: { type: mongoose.Schema.Types.ObjectId }, name: String, email: String, role: String },
    action: { type: String, required: true },
    entityType: String,
    entityId: String,
    entityLabel: String,
    summary: String,
    meta: mongoose.Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ 'actor.id': 1, createdAt: -1 });
auditSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

const BLOCKED = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany'];
BLOCKED.forEach((op) => auditSchema.pre(op, function (next) { next(new Error('Audit log is append-only')); }));
auditSchema.pre('save', function (next) { next(this.isNew ? undefined : new Error('Audit log is append-only')); });

export default mongoose.model('AuditLog', auditSchema);
