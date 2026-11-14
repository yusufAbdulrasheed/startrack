import mongoose from "mongoose";

// One completed batch: raw materials in, finished stock out. The embedded
// `components` snapshot is what keeps this readable after the product's
// recipe changes later — exactly why Sale.items[].components exists for
// made-to-order lines (server/modules/sales/sale.model.js).
const productionRunSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    runNo: { type: String, required: true }, // human run number, per-branch sequence: PR-00001
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    producedUnits: { type: Number, required: true, min: 1 }, // e.g. bottles or sachets produced
    leakage: { type: Number, default: 0, min: 0 }, // burst/torn units lost mid-run
    creditedQty: { type: Number, required: true, min: 0 }, // stock units actually credited, after yield
    producedUnitsPerStockUnit: { type: Number, required: true }, // yield rule snapshot at run time
    components: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        includedLeakage: { type: Boolean, default: true },
      },
    ],
    note: { type: String, default: "" },
    staffId: { type: mongoose.Schema.Types.ObjectId },
    staffName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

productionRunSchema.index({ businessId: 1, branchId: 1, at: -1 });
productionRunSchema.index({ businessId: 1, runNo: 1 });

export const ProductionRun = mongoose.model("ProductionRun", productionRunSchema);
