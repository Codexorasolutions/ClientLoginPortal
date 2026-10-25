import mongoose from 'mongoose';

// A saved payment receipt. The PDF is always generated from this record (never from temporary form data).
// Money columns are in rupees with at most 2 decimals. Receipts are never deleted — a mistaken one is cancelled ("void").
const itemSchema = new mongoose.Schema(
  { description: { type: String, required: true, trim: true, maxlength: 120 }, amount: { type: Number, required: true, min: 0.01 } },
  { _id: false }
);

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true }, // RCT-2026-0001
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', index: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true }, // set when the receipt settles an invoice

    // "Received from" — copied from the client's profile but editable per receipt, so later profile edits never change old receipts
    clientName: { type: String, trim: true, maxlength: 80 },
    clientBusiness: { type: String, trim: true, maxlength: 100 },
    clientPhone: { type: String, trim: true, maxlength: 30 },
    clientEmail: { type: String, trim: true, maxlength: 120 },

    paymentMode: { type: String, enum: ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'], required: true },
    transactionId: { type: String, trim: true, maxlength: 60 },
    paymentDate: { type: Date, required: true },
    projectPlan: { type: String, trim: true, maxlength: 80 },

    items: { type: [itemSchema], validate: (v) => v.length >= 1 && v.length <= 10 },
    amountReceived: { type: Number, required: true, min: 0.01 }, // this receipt only (= sum of items)
    totalProjectCost: { type: Number, required: true, min: 0 },
    receivedBefore: { type: Number, required: true, min: 0 },    // everything received on earlier receipts
    receivedToDate: { type: Number, required: true },            // receivedBefore + amountReceived
    balanceDue: { type: Number, required: true },                // negative only when overpayment was explicitly allowed
    allowOverpayment: { type: Boolean, default: false },
    status: { type: String, enum: ['paid_in_full', 'part_payment', 'unpaid'], required: true },
    notes: { type: String, trim: true, maxlength: 300 },

    // the recorded verification event: the receipt is only "digitally verified" because this exists
    verification: {
      id: { type: String, required: true, unique: true }, // 9F3A-C21B-77D0
      signedAt: { type: Date, required: true },
      signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      method: { type: String, default: 'HMAC-SHA256 (server-generated)' },
    },
    issuer: { type: mongoose.Schema.Types.Mixed },      // snapshot of the business details/wording used on this receipt
    idempotencyKey: { type: String, unique: true },     // a double-click / retry can never create two receipts
    source: { type: String, enum: ['manual', 'invoice'], default: 'manual' },

    voided: { type: Boolean, default: false, index: true },
    voidedAt: Date,
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, trim: true, maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

receiptSchema.index({ client: 1, voided: 1, paymentDate: -1 });
receiptSchema.index({ paymentDate: -1, createdAt: -1 });

export default mongoose.model('Receipt', receiptSchema);
