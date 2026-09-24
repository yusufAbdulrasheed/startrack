import mongoose from "mongoose";

/**
 * A persisted AI restock suggestion — not stateless, so the approval UI
 * survives a page reload and a suggestion isn't silently regenerated (and
 * re-shown) every time the panel is opened. The only write this whole AI
 * phase makes to real business data happens through the approve endpoint
 * (ai.routes.js), and only after this row is explicitly approved — never
 * automatically.
 */
const restockSuggestionSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true },
    currentStock: { type: Number, required: true },
    reorderLevel: { type: Number, required: true },
    suggestedQty: { type: Number, required: true },
    reasoning: { type: String, default: "" },
    status: { type: String, enum: ["pending", "approved", "dismissed"], default: "pending" },
    generatedAt: { type: Date, default: Date.now },
    decidedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    decidedByName: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
    appliedAs: { type: String, enum: ["reorder_level", "stock_in", null], default: null },
  },
  { timestamps: true }
);

restockSuggestionSchema.index({ businessId: 1, status: 1, generatedAt: -1 });
// One pending suggestion per product at a time — regenerating updates it
// in place rather than piling up duplicates the owner has to wade through.
restockSuggestionSchema.index({ businessId: 1, productId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });

export const RestockSuggestion = mongoose.model("RestockSuggestion", restockSuggestionSchema);
