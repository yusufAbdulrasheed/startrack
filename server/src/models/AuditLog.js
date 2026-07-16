import mongoose from "mongoose";

// Owner-visible timeline of every sensitive action. Append-only.
const auditLogSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, default: "" },
    action: { type: String, required: true }, // e.g. sale.void, staff.pin_reset, product.price_change
    target: {
      type: { type: String, default: "" }, // product | sale | staff | settings | ...
      id: { type: mongoose.Schema.Types.ObjectId },
      label: { type: String, default: "" },
    },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

auditLogSchema.index({ businessId: 1, at: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
