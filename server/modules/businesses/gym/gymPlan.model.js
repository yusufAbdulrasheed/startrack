import mongoose from "mongoose";

// Monthly/Quarterly/Annual — an owner-defined membership tier. Selling one
// is what server/modules/businesses/gym/gym.routes.js's POST /subscriptions
// turns into a real Sale (see there for why: revenue recognition, DailyMetric,
// the whole point of the "recurring access, not one-off sales" capability).
const gymPlanSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

gymPlanSchema.index({ businessId: 1, active: 1 });

export const GymPlan = mongoose.model("GymPlan", gymPlanSchema);
