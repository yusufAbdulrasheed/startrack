import mongoose from "mongoose";

// A piece of client work agreed for a budget. Milestones say what gets
// delivered and what each delivery is worth; payments say what the client has
// actually handed over. The gap between the two is what the agency is owed.
const projectSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    projectNo: { type: String, required: true }, // P-0001, per business
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    clientName: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, default: "General", trim: true }, // Web App, Mobile App, Data Analysis, Design…
    description: { type: String, default: "" },
    lead: { type: String, default: "", trim: true }, // who is running it
    budget: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["proposal", "active", "on_hold", "completed", "cancelled"], default: "proposal" },
    startDate: { type: String, default: "" },
    dueDate: { type: String, default: "" },
    completedAt: Date,
    milestones: {
      type: [
        {
          title: { type: String, required: true, trim: true },
          amount: { type: Number, required: true, min: 0 },
          dueDate: { type: String, default: "" },
          status: { type: String, enum: ["pending", "done"], default: "pending" },
          doneAt: Date,
        },
      ],
      default: [],
    },
    amountPaid: { type: Number, default: 0, min: 0 },
    payments: {
      type: [
        {
          _id: false,
          saleId: { type: mongoose.Schema.Types.ObjectId, required: true },
          saleNo: String,
          amount: { type: Number, required: true },
          method: String,
          note: String,
          at: { type: Date, default: Date.now },
          byName: String,
          reversed: { type: Boolean, default: false },
          reversedReason: String,
        },
      ],
      default: [],
    },
    timeLogs: {
      type: [
        {
          date: { type: String, required: true },
          who: { type: String, default: "" },
          hours: { type: Number, required: true, min: 0.1, max: 24 },
          note: { type: String, default: "" },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

projectSchema.index({ businessId: 1, status: 1, dueDate: 1 });
projectSchema.index({ businessId: 1, projectNo: 1 }, { unique: true });
projectSchema.index({ businessId: 1, customerId: 1 });

export const Project = mongoose.model("Project", projectSchema);
