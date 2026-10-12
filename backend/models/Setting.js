import mongoose from 'mongoose';

// One document (key: 'main') holds every owner-editable setting.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'main' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Setting', settingSchema);
