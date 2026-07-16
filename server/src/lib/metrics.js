import { DailyMetric } from "../models/DailyMetric.js";
import { money } from "./money.js";

// Business-local calendar day. v1 uses the server's local day (pilot shops
// share the server timezone); per-business timezones slot in here later.
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Incrementally applies a delta to the day's pre-rolled metrics.
 * delta: { revenue, cost, profit, txns, discountTotal, vatTotal, refundTotal,
 *          expenses, payments: {cash, pos, transfer} }
 */
export async function bumpDailyMetric(ctx, branchId, date, delta) {
  const inc = {};
  for (const k of ["revenue", "cost", "profit", "txns", "discountTotal", "vatTotal", "refundTotal", "expenses"]) {
    if (delta[k]) inc[k] = money(delta[k]);
  }
  for (const m of ["cash", "pos", "transfer"]) {
    if (delta.payments?.[m]) inc[`paymentSplit.${m}`] = money(delta.payments[m]);
  }
  if (!Object.keys(inc).length) return;
  await DailyMetric.findOneAndUpdate(
    { businessId: ctx.businessId, branchId, date },
    { $inc: inc, $setOnInsert: { accountId: ctx.accountId } },
    { upsert: true }
  );
}
