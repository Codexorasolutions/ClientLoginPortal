import mongoose from 'mongoose';

const deliverableSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    name: { type: String, required: true },
    type: { type: String, enum: ['Preview link', 'Document', 'Image', 'Other'], default: 'Other' },
    url: { type: String, required: true }, // Cloudinary secure_url
    versionLabel: { type: String, trim: true, maxlength: 30 }, // e.g. "v2", "Final" — auto-numbered if left blank
  },
  { timestamps: true }
);

export default mongoose.model('Deliverable', deliverableSchema);
