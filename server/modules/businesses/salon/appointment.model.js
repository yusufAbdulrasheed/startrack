import mongoose from "mongoose";

// A booked slot of a provider's time. `startsAt`/`endsAt` are what conflict
// detection runs on; prices and durations are snapshotted from the menu at
// booking time so a later price change doesn't rewrite what was agreed.
const appointmentSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, default: "" },
    items: {
      type: [
        {
          _id: false,
          serviceId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          price: { type: Number, required: true },
          durationMins: { type: Number, required: true },
        },
      ],
      validate: (v) => v.length > 0,
    },
    provider: { type: String, default: "", trim: true }, // the stylist/barber/therapist
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationMins: { type: Number, required: true },
    total: { type: Number, required: true }, // sum of items, before any discount at completion
    deposit: {
      amount: { type: Number, default: 0 },
      method: String,
      saleId: mongoose.Schema.Types.ObjectId,
      saleNo: String,
    },
    status: { type: String, enum: ["booked", "in_progress", "completed", "no_show", "cancelled"], default: "booked" },
    notes: { type: String, default: "" },
    cancelReason: { type: String, default: "" },
    discount: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 }, // deposit + balance actually received
    completedAt: Date,
    balanceSaleId: mongoose.Schema.Types.ObjectId,
    balanceSaleNo: String,
    bookedByName: String,
  },
  { timestamps: true }
);

appointmentSchema.index({ businessId: 1, branchId: 1, startsAt: 1 });
appointmentSchema.index({ businessId: 1, provider: 1, startsAt: 1 });

export const Appointment = mongoose.model("Appointment", appointmentSchema);
