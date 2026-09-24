import mongoose from "mongoose";

/**
 * A proposed write the AI wants to make, waiting on a human. This is the
 * ONLY door through which "Ask AI" can ever touch real data — see
 * ai.service.js's proposeActions() (which only ever creates rows here) and
 * aiActions.service.js's executeAction() (which only ever runs from the
 * approve route, never from the chat call itself).
 */
const aiActionSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null },

    type: {
      type: String,
      required: true,
      enum: [
        "create_customer", "create_product", "adjust_stock",
        "record_sale", "process_return",
        "create_staff",
      ],
    },
    // Shape depends on `type` — see aiActions.service.js's per-type schemas.
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    reasoning: { type: String, default: "" }, // the AI's own stated reason
    question: { type: String, default: "" }, // the chat message that led here

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    proposedById: { type: mongoose.Schema.Types.ObjectId, required: true },
    proposedByName: { type: String, required: true },
    decidedById: { type: mongoose.Schema.Types.ObjectId, default: null },
    decidedByName: { type: String, default: "" },
    decidedAt: { type: Date, default: null },

    // What actually got created, once approved — so the UI can link to it.
    resultRef: {
      type: { type: String, default: "" },
      id: { type: mongoose.Schema.Types.ObjectId },
      label: { type: String, default: "" },
    },
    // Set if approval was attempted but the underlying write failed
    // (stale data, a validation the AI's draft didn't anticipate, etc.) —
    // the row stays "pending" so it can be retried or rejected explicitly.
    error: { type: String, default: "" },
  },
  { timestamps: true }
);

aiActionSchema.index({ businessId: 1, status: 1, createdAt: -1 });

export const AiAction = mongoose.model("AiAction", aiActionSchema);
