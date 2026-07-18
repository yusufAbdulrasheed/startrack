import mongoose from "mongoose";

// The billing + login umbrella (formerly "organization"). Invisible in the UI
// until a user owns more than one business. Every tenant record traces to this.
const accountSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    plan: { type: String, enum: ["free", "growth", "pro"], default: "free" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    // Throwaway "Try the demo" sandboxes — swept after 24h.
    isSandbox: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

export const Account = mongoose.model("Account", accountSchema);
