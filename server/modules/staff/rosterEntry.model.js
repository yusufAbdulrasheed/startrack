import mongoose from "mongoose";

// One staff member on one named shift on one date — the roster is just a list
// of these, joined against Shift for the name/time. Attendance stays the
// separate record of what actually happened; this is what was planned.
const rosterEntrySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
    membershipId: { type: mongoose.Schema.Types.ObjectId, ref: "Membership", required: true, index: true },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", required: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
  },
  { timestamps: true }
);

rosterEntrySchema.index({ businessId: 1, membershipId: 1, date: 1 });

export const RosterEntry = mongoose.model("RosterEntry", rosterEntrySchema);
