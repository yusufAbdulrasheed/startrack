import mongoose from "mongoose";

// The service menu: what can be booked, for how long, at what price. Distinct
// from Product — a haircut has no stock, only a duration that takes up a chair.
const salonServiceSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "General", trim: true },
    price: { type: Number, required: true, min: 0 },
    durationMins: { type: Number, required: true, min: 5, max: 720 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

salonServiceSchema.index({ businessId: 1, active: 1, category: 1, name: 1 });

export const SalonService = mongoose.model("SalonService", salonServiceSchema);
