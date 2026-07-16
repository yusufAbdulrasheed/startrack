import mongoose from "mongoose";

// Header + lines in one document. Discounts and VAT live on the header;
// line totals are net. Voided sales are kept and flagged — never deleted.
const saleSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    saleNo: { type: String, required: true }, // human receipt number, per-branch sequence
    at: { type: Date, default: Date.now },
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true }, // userId of seller
    staffName: { type: String, default: "" },
    customerId: { type: mongoose.Schema.Types.ObjectId },
    customerName: { type: String, default: "" },
    items: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true },
        lineCost: { type: Number, default: 0 }, // qty * unit cost at time of sale
        lineNet: { type: Number, required: true }, // qty * unitPrice
        returnedQty: { type: Number, default: 0 }, // maintained by the returns module
      },
    ],
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    total: { type: Number, required: true },
    payments: [
      {
        _id: false,
        method: { type: String, enum: ["cash", "pos", "transfer"], required: true },
        amount: { type: Number, required: true },
      },
    ],
    status: { type: String, enum: ["completed", "voided"], default: "completed" },
    voidInfo: {
      by: { type: mongoose.Schema.Types.ObjectId },
      byName: { type: String },
      reason: { type: String },
      at: { type: Date },
    },
    clientSaleId: { type: String }, // offline-queue idempotency key
  },
  { timestamps: true }
);

saleSchema.index({ businessId: 1, branchId: 1, at: -1 });
saleSchema.index({ businessId: 1, saleNo: 1 });
saleSchema.index({ businessId: 1, customerId: 1, at: -1 });
saleSchema.index({ businessId: 1, staffId: 1, at: -1 });
saleSchema.index(
  { businessId: 1, clientSaleId: 1 },
  { unique: true, partialFilterExpression: { clientSaleId: { $type: "string" } } }
);

export const Sale = mongoose.model("Sale", saleSchema);
