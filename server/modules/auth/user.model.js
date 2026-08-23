import mongoose from "mongoose";

// A person who logs in (the human, not the business).
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" },

    /**
     * StarTrack-side role, entirely separate from what this person is inside
     * any business. An overseer works FOR StarTrack and can see every account
     * on the platform; a business owner is the top of their own tree and can
     * never see another shop, no matter their role there.
     *
     * Deliberately not part of the tenant permission system — mixing the two
     * is how a customer accidentally gets god rights.
     */
    platformRole: { type: String, enum: ["none", "support", "overseer"], default: "none", index: true },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
