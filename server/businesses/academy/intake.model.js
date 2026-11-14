import mongoose from "mongoose";

// One scheduled run of a course — "React, November evening class". Students
// enrol into an intake, never into the bare course.
const intakeSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    courseName: { type: String, required: true }, // snapshot, so renaming a course doesn't rewrite history
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, default: "" },
    schedule: { type: String, default: "" }, // "Mon & Wed, 6–8pm"
    tutor: { type: String, default: "", trim: true },
    mode: { type: String, enum: ["online", "physical", "hybrid"], default: "hybrid" },
    capacity: { type: Number, default: 20, min: 1 },
    // What this intake charges. Defaults to the course fee at creation but is
    // its own number — a promo intake can cost less without touching the course.
    fee: { type: Number, required: true, min: 0 },
    plannedSessions: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["upcoming", "running", "completed", "cancelled"], default: "upcoming" },
  },
  { timestamps: true }
);

intakeSchema.index({ businessId: 1, branchId: 1, status: 1, startDate: -1 });

export const Intake = mongoose.model("Intake", intakeSchema);
