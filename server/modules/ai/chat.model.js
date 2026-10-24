import mongoose from "mongoose";

/**
 * A saved AI conversation. Private to the person who had it: the list and
 * every read below filter on userId as well as businessId, so a manager can't
 * browse the owner's questions (which may quote private numbers).
 *
 * Turns are stored as they were shown. A proposal keeps only its id and
 * description here — whether it was approved, rejected or is still waiting is
 * read live from the AiAction row when a chat is opened, so history never
 * shows a stale "pending" for something that was since approved elsewhere.
 */
const turnSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    answer: { type: String, required: true },
    proposals: [
      {
        _id: false,
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        type: { type: String, default: "" },
        description: { type: String, default: "" },
      },
    ],
    // Report cards offered with this answer. Only the recipe is stored — the
    // file itself is rebuilt from live data whenever someone downloads it.
    reports: [
      {
        _id: false,
        kind: { type: String, required: true },
        days: { type: Number, default: null },
        title: { type: String, default: "" },
      },
    ],
    // A file the person attached, and what was drafted from it. Only a summary
    // is kept: the rows themselves live on the pending AiAction.
    files: [{ _id: false, name: { type: String, default: "" }, size: { type: Number, default: 0 } }],
    imports: { type: [mongoose.Schema.Types.Mixed], default: [] },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const aiChatSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    module: { type: String, default: "" }, // the screen it started on, e.g. "products"
    title: { type: String, required: true, maxlength: 90 },
    turns: { type: [turnSchema], default: [] },
  },
  { timestamps: true }
);

aiChatSchema.index({ businessId: 1, userId: 1, updatedAt: -1 });

export const AiChat = mongoose.model("AiChat", aiChatSchema);
