import mongoose from "mongoose";

/**
 * A customer's login on ONE business's online store.
 *
 * Deliberately not the app's `User`: a shopper has no membership, no
 * permissions and no way into any dashboard, and the same person registering at
 * two businesses gets two unrelated accounts (a shop's customers are that
 * shop's business, not StarTrack's). Each shopper points at the `Customer` row
 * in the owner's customer book — that row is what the owner sees and what
 * sales are recorded against.
 */
const shopperSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    lastLoginAt: { type: Date },
    // Password reset: a short code, stored hashed, with an expiry and a try limit.
    resetCodeHash: { type: String },
    resetExpiresAt: { type: Date },
    resetAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

shopperSchema.index({ businessId: 1, email: 1 }, { unique: true });
shopperSchema.index({ businessId: 1, customerId: 1 });

export const Shopper = mongoose.model("Shopper", shopperSchema);
