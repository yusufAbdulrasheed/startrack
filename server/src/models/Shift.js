import mongoose from "mongoose";

// A named work window (e.g. "Morning 8am–2pm"). Staff are assigned via
// membership.shiftId; attendance stays the record of what actually happened.
const shiftSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    start: { type: String, required: true }, // "HH:MM"
    end: { type: String, required: true },
  },
  { timestamps: true }
);

export const Shift = mongoose.model("Shift", shiftSchema);
