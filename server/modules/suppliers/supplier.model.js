import mongoose from "mongoose";

/**
 * Sourcing is rarely formal — a "meat guy," a market vendor, a distributor
 * with a fixed price list — so a supplier here is deliberately lightweight:
 * a name and how they're usually paid, nothing that assumes a catalog or a
 * standing contract. Per-delivery cost lives on the StockMovement ledger
 * itself (see stockMovement.model.js's unitCost/supplierId), not here — one
 * append-only source of truth rather than a second price-history collection.
 */
const supplierSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    contact: { type: String, default: "", trim: true }, // phone / WhatsApp
    type: { type: String, enum: ["market", "distributor", "one_off"], default: "market" },
    paymentTerms: { type: String, enum: ["cash", "credit"], default: "cash" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

supplierSchema.index({ businessId: 1, name: 1 });

export const Supplier = mongoose.model("Supplier", supplierSchema);
