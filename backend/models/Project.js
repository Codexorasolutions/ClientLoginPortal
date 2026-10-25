import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }, // e.g. "Shanti Public School — Website"
    planLabel: { type: String, default: 'Website' }, // e.g. "School Website — Standard"
    stage: {
      type: String,
      enum: ['discovery', 'design', 'development', 'review', 'live'],
      default: 'discovery',
    },
    nextMilestoneLabel: { type: String },
    nextMilestoneDate: { type: Date },
    stagingUrl: { type: String, trim: true }, // preview link shared with the client
    statusNote: { type: String, trim: true, maxlength: 500 }, // short plain-language update from the owner
    statusNoteUpdatedAt: { type: Date }, // when the note itself last changed (not any project save)
    // agreed total price of the project, in ₹ — the base for every payment receipt's "Balance due"
    totalCost: { type: Number, min: 0 },
    // bumped on every receipt create/cancel; makes two receipts saved at the same moment re-check the balance
    receiptsVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Project', projectSchema);
