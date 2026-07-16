import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    type: { type: String, required: true, trim: true }, // Rent, Fuel, Salaries, …
    amount: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" },
    paidBy: { type: String, default: "" },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

expenseSchema.index({ businessId: 1, branchId: 1, at: -1 });

export const Expense = mongoose.model("Expense", expenseSchema);
