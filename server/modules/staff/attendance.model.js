import mongoose from "mongoose";

// One row per staff per day. Clock-out fills hours.
const attendanceSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    staffName: { type: String, default: "" },
    date: { type: String, required: true }, // YYYY-MM-DD (business-local day)
    clockIn: { type: Date, required: true },
    clockOut: { type: Date },
    hours: { type: Number, default: 0 },
  },
  { timestamps: true }
);

attendanceSchema.index({ businessId: 1, branchId: 1, date: -1 });
attendanceSchema.index({ businessId: 1, userId: 1, date: -1 });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
