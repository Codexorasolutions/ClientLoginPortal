import mongoose from 'mongoose';

const replySchema = new mongoose.Schema(
  {
    author: { type: String, enum: ['client', 'owner'], required: true },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

const ticketSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 2000 }, // the original message that opened the ticket
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    replies: [replySchema],
    // who spoke last — drives the "awaiting your reply" indicator on each side
    lastReplyBy: { type: String, enum: ['client', 'owner'], default: 'client' },
  },
  { timestamps: true }
);

export default mongoose.model('SupportTicket', ticketSchema);
