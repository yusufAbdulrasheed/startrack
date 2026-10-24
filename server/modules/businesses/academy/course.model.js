import mongoose from "mongoose";

// What the academy teaches — the catalog, not a scheduled class. A course is
// run any number of times as an Intake (intake.model.js).
const courseSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    // Free text so the academy can invent its own tracks ("Data Analysis",
    // "Frontend", "Backend", "Mobile"…).
    category: { type: String, default: "General", trim: true },
    level: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    mode: { type: String, enum: ["online", "physical", "hybrid"], default: "hybrid" },
    durationWeeks: { type: Number, default: 4, min: 0 },
    fee: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

courseSchema.index({ businessId: 1, active: 1, name: 1 });

export const Course = mongoose.model("Course", courseSchema);
