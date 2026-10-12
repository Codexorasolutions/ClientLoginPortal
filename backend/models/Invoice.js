import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['due', 'paid'], default: 'due' },
    dueDate: { type: Date },
    invoiceNumber: { type: String, unique: true, sparse: true }, // e.g. INV-2026-0007 (older invoices have none)
    paymentLink: { type: String, trim: true }, // optional online payment link shown as a "Pay now" button
    paidAt: { type: Date },

    // filled in by the owner when marking an invoice paid; printed on the payment receipt
    paymentMode: { type: String, enum: ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'] },
    transactionId: { type: String, trim: true, maxlength: 60 },
  },
  { timestamps: true }
);

export default mongoose.model('Invoice', invoiceSchema);
