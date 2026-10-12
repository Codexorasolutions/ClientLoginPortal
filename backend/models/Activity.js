import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['approval', 'milestone', 'invoice', 'deliverable', 'ticket'],
      required: true,
    },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Activity', activitySchema);
