import mongoose from "mongoose";

// The fast-read current state of one member's access — mirrors the
// Inventory/Customer.creditBalance pattern already in this codebase: a
// quick "are they active right now" read, with the append-only history
// (renewals here, check-ins in gymCheckIn.model.js) kept separately so this
// document never grows unbounded.
const gymSubscriptionSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerName: { type: String, required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, required: true },
    planName: { type: String, required: true },
    startDate: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },
    purchasedAt: { type: Date, default: Date.now },
    saleId: { type: mongoose.Schema.Types.ObjectId, default: null },
    renewalHistory: {
      type: [
        {
          at: { type: Date, default: Date.now },
          planId: mongoose.Schema.Types.ObjectId,
          planName: String,
          saleId: mongoose.Schema.Types.ObjectId,
          expiresAtAfter: Date,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

gymSubscriptionSchema.index({ businessId: 1, customerId: 1 });
gymSubscriptionSchema.index({ businessId: 1, status: 1, expiresAt: 1 });

export const GymSubscription = mongoose.model("GymSubscription", gymSubscriptionSchema);
