import mongoose from "mongoose";

// One row per physical unit of a product flagged tracksSerials — the real
// backing for the "serials" capability ("track each unit individually, with
// warranty and repair history"). Registered at stock-in, flipped to "sold"
// at checkout if the cashier picked one; "repair history" is read by
// querying Job for the same serialNo rather than duplicating a ticket system.
const serialSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, default: "" },
    serialNo: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["in_stock", "sold", "returned", "repair", "warranty_void", "written_off"],
      default: "in_stock",
    },
    saleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerName: { type: String, default: "" },
    soldAt: { type: Date, default: null },
    // Computed at the moment of sale from the product's warrantyMonths —
    // never set otherwise, and null when the product carries no warranty.
    warrantyExpiresAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    at: { type: Date, default: Date.now }, // when it entered stock
  },
  { timestamps: true }
);

serialSchema.index({ businessId: 1, serialNo: 1 }, { unique: true });
serialSchema.index({ businessId: 1, productId: 1, status: 1 });

export const Serial = mongoose.model("Serial", serialSchema);
