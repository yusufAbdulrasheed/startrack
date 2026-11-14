import mongoose from "mongoose";

// A dosage record for a flock or batch — vaccination or medication. Pure log:
// no stock, cost or money moves because of one of these. "nextDueAt" is
// stored for reference only, same honest limit as the source spec — nothing
// currently reads it back to raise a reminder.
const vaccinationSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, enum: ["vaccination", "medication"], required: true },
    name: { type: String, required: true, trim: true }, // e.g. "Newcastle Disease", "Amprolium"
    batchLabel: { type: String, default: "", trim: true }, // which flock/batch, free text
    dosage: { type: String, default: "" },
    administeredAt: { type: Date, default: Date.now },
    nextDueAt: { type: Date, default: null },
    notes: { type: String, default: "" },
    staffId: { type: mongoose.Schema.Types.ObjectId },
    staffName: { type: String, default: "" },
  },
  { timestamps: true }
);

vaccinationSchema.index({ businessId: 1, branchId: 1, administeredAt: -1 });

export const VaccinationRecord = mongoose.model("VaccinationRecord", vaccinationSchema);
