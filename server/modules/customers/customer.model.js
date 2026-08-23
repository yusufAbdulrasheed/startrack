import mongoose from "mongoose";

// CRM-lite, scoped per business (a customer of one business is invisible
// to every other business on the platform).
const customerSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    whatsapp: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    totalSpend: { type: Number, default: 0 },
    visits: { type: Number, default: 0 },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    lastBranchId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

customerSchema.index({ businessId: 1, name: 1 });
customerSchema.index({ businessId: 1, phone: 1 });

export const Customer = mongoose.model("Customer", customerSchema);
