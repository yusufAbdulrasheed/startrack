import mongoose from "mongoose";

// A separate, append-only ledger — same reason StockMovement is separate
// from Inventory.stock and CustomerLedgerEntry from Customer.creditBalance:
// an unbounded log doesn't belong embedded in the fast-read state document.
const gymCheckInSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerName: { type: String, required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    allowed: { type: Boolean, required: true },
    reason: { type: String, default: "" }, // set when allowed is false (e.g. "expired")
    at: { type: Date, default: Date.now },
    byStaffId: { type: mongoose.Schema.Types.ObjectId, required: true },
    byStaffName: { type: String, required: true },
  },
  { timestamps: true }
);

gymCheckInSchema.index({ businessId: 1, at: -1 });
gymCheckInSchema.index({ businessId: 1, customerId: 1, at: -1 });

export const GymCheckIn = mongoose.model("GymCheckIn", gymCheckInSchema);
