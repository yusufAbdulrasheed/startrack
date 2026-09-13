import mongoose from "mongoose";

/**
 * One carton-opening event: `cartonsOpened` were expected to yield
 * `cartonsOpened × packSizeKg`, but the scale said `actualWeighedKg`. The gap
 * is the ice-glaze/dehydration shrinkage this trade lives with — logged here
 * as its own number so it shows up in reporting instead of quietly vanishing
 * into "why did we come up short at count time."
 *
 * This is also where a piece-selling cold room gets a real per-piece cost:
 * `resultingPieceCount` alongside the same weighed kg lets the batch record
 * its own average piece weight (see batch.model.js's avgPieceWeightKg).
 */
const breakdownSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    batchId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productName: { type: String, default: "" },

    cartonsOpened: { type: Number, required: true, min: 0.01 },
    expectedYieldKg: { type: Number, required: true },
    actualWeighedKg: { type: Number, required: true, min: 0 },
    // expected − actual: positive = shrinkage (the normal case), negative =
    // it weighed in heavier than declared (a generous supplier, a re-glaze).
    varianceKg: { type: Number, required: true },
    variancePercent: { type: Number, required: true },

    resultingPieceCount: { type: Number, min: 0 },

    byName: { type: String, default: "" },
    note: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

breakdownSchema.index({ businessId: 1, branchId: 1, productId: 1, at: -1 });

export const ColdRoomBreakdown = mongoose.model("ColdRoomBreakdown", breakdownSchema);
