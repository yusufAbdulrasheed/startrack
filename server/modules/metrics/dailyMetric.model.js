import mongoose from "mongoose";

// Pre-rolled daily numbers per branch, updated incrementally on every sale,
// void, approved return, expense and recorded waste — dashboards never scan
// raw sales.
const dailyMetricSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    revenue: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    profit: { type: Number, default: 0 },
    txns: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    vatTotal: { type: Number, default: 0 },
    refundTotal: { type: Number, default: 0 },
    // Cost value of stock recorded as waste (spoilage, damage, breakage…) —
    // never sold, so it never touches revenue/cost, but it erodes profit
    // exactly like a refund does. See POST /api/inventory/waste.
    wasteTotal: { type: Number, default: 0 },
    expenses: { type: Number, default: 0 },
    paymentSplit: {
      cash: { type: Number, default: 0 },
      pos: { type: Number, default: 0 },
      transfer: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

dailyMetricSchema.index({ businessId: 1, branchId: 1, date: -1 }, { unique: true });

export const DailyMetric = mongoose.model("DailyMetric", dailyMetricSchema);
