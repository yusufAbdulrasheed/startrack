import mongoose from "mongoose";

/**
 * A scannable loyalty/access card — issued once a customer qualifies (or,
 * for a gym subscription, immediately on signup; see gym.routes.js), then
 * reused at every future visit. Deliberately a separate model from Customer:
 * a card's existence and lifecycle ARE the feature (no card = not yet
 * qualified), and this exact model is reused verbatim for gym check-in —
 * a member's loyalty card IS their check-in card, not a second QR system.
 */
const loyaltyCardSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Unguessable capability token, not the customer id — scanning it (or
    // knowing it) is what grants the discount/check-in, like a share link.
    code: { type: String, required: true, unique: true },
    status: { type: String, enum: ["active", "revoked"], default: "active" },
    issuedAt: { type: Date, default: Date.now },
    issuedVia: { type: String, enum: ["patronage", "gym_signup", "manual"], default: "patronage" },
    lastScannedAt: { type: Date, default: null },
    scanCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

loyaltyCardSchema.index({ businessId: 1, customerId: 1, status: 1 });

export const LoyaltyCard = mongoose.model("LoyaltyCard", loyaltyCardSchema);
