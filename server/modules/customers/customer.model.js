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
    // Loyalty (the "loyalty" capability — water, for now). A running lifetime
    // tally, maintained by the sale that causes it, same as totalSpend/visits
    // above — never recomputed by scanning history. Only sachet/bag lines
    // count toward tokens; see sales.routes.js.
    sachetBagQty: { type: Number, default: 0 },
    tokensRedeemed: { type: Number, default: 0 },
    // Recurring supply — "put this customer on a weekly delivery."
    supplySchedule: {
      interval: { type: String, enum: ["none", "daily", "weekly", "biweekly", "monthly"], default: "none" },
      nextDueAt: { type: Date, default: null },
    },
    // The "credit" capability's running balance owed — a fast-read total,
    // maintained in lockstep with customerLedger.model.js's append-only
    // CustomerLedgerEntry, the same relationship Inventory.stock has with
    // StockMovement. Positive = the customer owes this business money.
    creditBalance: { type: Number, default: 0 },
  },
  { timestamps: true }
);

customerSchema.index({ businessId: 1, name: 1 });
customerSchema.index({ businessId: 1, phone: 1 });

export const Customer = mongoose.model("Customer", customerSchema);
