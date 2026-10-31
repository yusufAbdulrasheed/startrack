import mongoose from "mongoose";

/**
 * One uploaded file of past records, kept so it can be seen later and, if it was
 * the wrong file, taken back out cleanly. Everything an import creates carries
 * this batch's id (sales, plus the customers and archived placeholder products it
 * had to make), which is what makes "undo" exact instead of a guess.
 */
const importBatchSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ["sales"], default: "sales" },
    fileName: { type: String, default: "" },
    status: { type: String, enum: ["active", "undone"], default: "active" },
    rows: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    from: { type: String, default: "" }, // YYYY-MM-DD
    to: { type: String, default: "" },
    newCustomers: { type: Number, default: 0 },
    newProducts: { type: Number, default: 0 },
    createdBy: { type: String, default: "" },
    undoneAt: { type: Date },
    undoneBy: { type: String, default: "" },
  },
  { timestamps: true }
);

importBatchSchema.index({ businessId: 1, createdAt: -1 });

export const ImportBatch = mongoose.model("ImportBatch", importBatchSchema);
