import mongoose from "mongoose";

// One held class, with who turned up. Kept as its own document per day so the
// attendance history never makes an Enrollment grow without bound.
const classSessionSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    intakeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    topic: { type: String, default: "", trim: true },
    tutor: { type: String, default: "" },
    attendance: {
      type: [
        {
          _id: false,
          enrollmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
          studentName: String,
          present: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    recordedByName: { type: String, default: "" },
  },
  { timestamps: true }
);

classSessionSchema.index({ intakeId: 1, date: 1 }, { unique: true });

export const ClassSession = mongoose.model("ClassSession", classSessionSchema);
