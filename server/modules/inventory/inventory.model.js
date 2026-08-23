import mongoose from "mongoose";

// Cached stock level per product per branch. The append-only stock_movements
// ledger is the truth; this is the fast-read derivative kept in lockstep.
const inventorySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    stock: { type: Number, default: 0 },
  },
  { timestamps: true }
);

inventorySchema.index({ branchId: 1, productId: 1 }, { unique: true });
inventorySchema.index({ businessId: 1, branchId: 1 });

export const Inventory = mongoose.model("Inventory", inventorySchema);
