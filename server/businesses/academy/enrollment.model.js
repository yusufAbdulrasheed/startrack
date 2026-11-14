import mongoose from "mongoose";

// A student's place in an intake, and the fee account that goes with it.
// `amountPaid` is a fast-read total kept in lockstep with `payments` (the same
// cached-total-plus-ledger shape as Inventory/StockMovement); the balance owed
// is always fee − amountPaid and is never stored.
const enrollmentSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    intakeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    intakeName: { type: String, required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, required: true },
    courseName: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    studentName: { type: String, required: true },
    studentPhone: { type: String, default: "" },
    listFee: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    fee: { type: Number, required: true, min: 0 }, // listFee − discount: what this student owes in total
    amountPaid: { type: Number, default: 0, min: 0 },
    payments: {
      type: [
        {
          _id: false,
          saleId: { type: mongoose.Schema.Types.ObjectId, required: true },
          saleNo: String,
          amount: { type: Number, required: true },
          method: String,
          at: { type: Date, default: Date.now },
          byName: String,
          reversed: { type: Boolean, default: false },
          reversedReason: String,
        },
      ],
      default: [],
    },
    status: { type: String, enum: ["enrolled", "completed", "dropped"], default: "enrolled" },
    certificateIssued: { type: Boolean, default: false },
    note: { type: String, default: "" },
    enrolledAt: { type: Date, default: Date.now },
    droppedAt: { type: Date },
  },
  { timestamps: true }
);

enrollmentSchema.index({ businessId: 1, intakeId: 1, status: 1 });
enrollmentSchema.index({ businessId: 1, customerId: 1 });

export const Enrollment = mongoose.model("Enrollment", enrollmentSchema);
