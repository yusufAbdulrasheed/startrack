import mongoose from "mongoose";

// A brand/shop within an account. Carries the business type (vertical) and its
// settings. This is what the user thinks of as "my business".
const businessSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    name: { type: String, required: true, trim: true },
    typeKey: { type: String, default: "retail" }, // retail | pharmacy | restaurant | ...
    settings: {
      currency: { type: String, default: "₦" },
      vatEnabled: { type: Boolean, default: false },
      vatRate: { type: Number, default: 7.5 },
    },
  },
  { timestamps: true }
);

export const Business = mongoose.model("Business", businessSchema);
