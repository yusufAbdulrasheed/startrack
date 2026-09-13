import mongoose from "mongoose";

/**
 * A purchase batch — the cost-basis FIFO queue behind a cold room's stock.
 *
 * Cartons are not a fixed unit: Titus comes 20kg to a carton, Panla comes in
 * 5/10/20kg variants, and the same species can land at a different carton
 * weight from a different supplier next week. So `packSizeKg` and
 * `unitCostPerCarton` belong to THIS batch, never to the product globally —
 * see product.custom on a generic Product for how every other trade's "cost"
 * is a single number; here it can only ever be true of one delivery.
 *
 * `remainingCartons` / `remainingKg` / `remainingPieces` are this one batch's
 * contribution to the product's three parallel stock pools. A product's real
 * on-hand picture is the SUM of these across every one of its open batches
 * (see coldroom.service.js) — never a single number, because a carton that's
 * been opened and a carton still sealed are genuinely different kinds of
 * stock a till has to treat differently.
 *
 * The generic Product/Inventory ledger still carries a carton-equivalent
 * mirror of the total (coldroom.service.js's syncCartonEquivalentStock) so
 * low-stock alerts, the Products catalog and the dashboard keep working
 * exactly like they do for every other business type — but THIS collection,
 * not Inventory.stock, is the source of truth.
 */
const coldRoomBatchSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productName: { type: String, default: "" }, // denormalized for fast ledger reads

    supplierId: { type: mongoose.Schema.Types.ObjectId },
    supplierName: { type: String, default: "" },
    purchaseDate: { type: Date, default: Date.now },

    cartonsReceived: { type: Number, required: true, min: 0.01 },
    packSizeKg: { type: Number, required: true, min: 0.01 }, // declared weight per carton, THIS lot
    unitCostPerCarton: { type: Number, required: true, min: 0 }, // this lot's own cost basis

    // Optional intake re-weigh — the earliest point to catch a short
    // delivery or an unusually heavy ice glaze, before a single kg is sold.
    actualWeighedKg: { type: Number, min: 0 },

    // The linked pools this batch still holds. A sale or breakdown always
    // debits exactly one of these, in the same write as the event that
    // caused it, so they can never drift from the ledger describing them.
    remainingCartons: { type: Number, required: true, min: 0 },
    remainingKg: { type: Number, default: 0, min: 0 },
    remainingPieces: { type: Number, default: 0, min: 0 },
    // Set by whichever breakdown most recently added loose pieces from this
    // batch — costPerPiece = costPerKg × this, so a piece sale carries a real
    // cost basis instead of a guess. Meaningless (0) until pieces exist.
    avgPieceWeightKg: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ["open", "closed"], default: "open", index: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// FIFO reads this: oldest open batch of a product, first — for cash-flow and
// quality both (older stock sells before it degrades further).
coldRoomBatchSchema.index({ businessId: 1, branchId: 1, productId: 1, status: 1, purchaseDate: 1 });

export const ColdRoomBatch = mongoose.model("ColdRoomBatch", coldRoomBatchSchema);
