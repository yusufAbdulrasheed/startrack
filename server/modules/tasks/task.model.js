import mongoose from "mongoose";

// A branch-level checklist item. assignedToId is null for a shared, whole-branch
// item anyone on shift can pick up — set it to hand something to one person.
const taskSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    title: { type: String, required: true, trim: true },
    notes: { type: String, default: "" },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: "Membership", default: null },
    status: { type: String, enum: ["open", "done"], default: "open" },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "Membership", required: true },
    createdByName: { type: String, default: "" },
    doneAt: { type: Date, default: null },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

taskSchema.index({ businessId: 1, branchId: 1, status: 1, at: -1 });

export const Task = mongoose.model("Task", taskSchema);
