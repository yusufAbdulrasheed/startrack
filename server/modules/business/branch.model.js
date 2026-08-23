import mongoose from "mongoose";

// A physical location of a business. Stock and sales live at the branch level.
const branchSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
  },
  { timestamps: true }
);

branchSchema.index({ businessId: 1, name: 1 });

export const Branch = mongoose.model("Branch", branchSchema);
