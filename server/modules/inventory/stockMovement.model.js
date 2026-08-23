import mongoose from "mongoose";

// The inventory truth: append-only. Never updated, never deleted.
// Undo is a new reversing movement, exactly like accounting.
const stockMovementSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, default: "" }, // denormalized for fast ledger reads
    type: {
      type: String,
      enum: ["IN", "OUT", "TRANSFER_IN", "TRANSFER_OUT", "RETURN", "ADJUST", "VOID_RESTOCK"],
      required: true,
    },
    qty: { type: Number, required: true }, // signed: positive adds stock, negative removes
    balanceAfter: { type: Number, required: true },
    refType: { type: String, default: "" }, // sale | return | transfer | manual
    refId: { type: mongoose.Schema.Types.ObjectId },
    reason: { type: String, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

stockMovementSchema.index({ businessId: 1, branchId: 1, productId: 1, at: -1 });
stockMovementSchema.index({ businessId: 1, branchId: 1, at: -1 });

export const StockMovement = mongoose.model("StockMovement", stockMovementSchema);
