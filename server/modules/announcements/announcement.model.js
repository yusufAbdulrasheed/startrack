import mongoose from "mongoose";

// A short broadcast from management. branchId null = posted to every branch
// of the business; set it to target one branch's team only.
const announcementSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "" },
    postedById: { type: mongoose.Schema.Types.ObjectId, ref: "Membership", required: true },
    postedByName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

announcementSchema.index({ businessId: 1, at: -1 });

export const Announcement = mongoose.model("Announcement", announcementSchema);
