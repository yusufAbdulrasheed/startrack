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
    refType: { type: String, default: "" }, // sale | return | transfer | manual | production | waste | stock_count
    refId: { type: mongoose.Schema.Types.ObjectId },
    reason: { type: String, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, default: "" },
    // Set only on a stock-in that named a per-delivery cost — the running
    // price history for a supplier lives here, not in a separate collection.
    unitCost: { type: Number },
    supplierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    supplierName: { type: String, default: "" },
    // Set only when refType === "waste" — spoilage/staff-meal/damage/etc.
    // "shrinkage" and "cold_chain_failure" are the cold-room trade's own two
    // (see server/modules/businesses/coldroom/): the first is the routine,
    // expected ice-glaze/dehydration gap between a carton's declared and
    // weighed-out kg; the second is a whole-batch loss from a power/generator
    // failure — same ledger door, deliberately distinguishable by this field.
    wasteReason: {
      type: String,
      enum: [
        "spoilage", "staff_meal", "damage", "expired", "broken", "cracked", "rotten", "contaminated",
        "shrinkage", "cold_chain_failure", "other",
      ],
    },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

stockMovementSchema.index({ businessId: 1, branchId: 1, productId: 1, at: -1 });
stockMovementSchema.index({ businessId: 1, branchId: 1, at: -1 });

export const StockMovement = mongoose.model("StockMovement", stockMovementSchema);
