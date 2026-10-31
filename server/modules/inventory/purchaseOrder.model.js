import mongoose from "mongoose";

/**
 * What the business has asked a supplier for. A purchase order moves no stock
 * until goods arrive: receiving is what adds to the shelf (through the same
 * stock ledger as everything else, with the supplier and unit cost recorded),
 * and it can happen in several deliveries.
 *
 *   draft → sent → partial → received        (or cancelled / closed early)
 */
export const PO_STATUSES = ["draft", "sent", "partial", "received", "cancelled", "closed"];

const poSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The store the goods are delivered to.
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    poNo: { type: String, required: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    supplierName: { type: String, default: "", trim: true },
    status: { type: String, enum: PO_STATUSES, default: "draft" },
    lines: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        unit: { type: String, default: "unit" },
        qty: { type: Number, required: true, min: 0.001 },
        unitCost: { type: Number, default: 0, min: 0 },
        receivedQty: { type: Number, default: 0, min: 0 },
      },
    ],
    total: { type: Number, default: 0 },
    expectedDate: { type: Date, default: null },
    notes: { type: String, default: "" },
    createdBy: { type: String, default: "" },
    sentAt: { type: Date },
    // One entry per delivery, so "what came in, when, and who booked it" is never a guess.
    receipts: [{ _id: false, at: { type: Date, default: Date.now }, by: String, lines: [{ _id: false, productId: mongoose.Schema.Types.ObjectId, name: String, qty: Number, unitCost: Number }] }],
  },
  { timestamps: true }
);

poSchema.index({ businessId: 1, poNo: 1 }, { unique: true });
poSchema.index({ businessId: 1, status: 1, createdAt: -1 });

export const PurchaseOrder = mongoose.model("PurchaseOrder", poSchema);
