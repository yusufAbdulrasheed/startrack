import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Return } from "#modules/returns/return.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { money } from "#core/money.js";

// Business-local calendar day. v1 uses the server's local day (pilot shops
// share the server timezone); per-business timezones slot in here later.
export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const NUMERIC = ["revenue", "cost", "profit", "txns", "discountTotal", "vatTotal", "refundTotal", "expenses"];
const METHODS = ["cash", "pos", "transfer"];

/**
 * Incrementally applies a delta to the day's pre-rolled metrics.
 * delta: { revenue, cost, profit, txns, discountTotal, vatTotal, refundTotal,
 *          expenses, payments: {cash, pos, transfer} }
 *
 * Pass the caller's `session` so the roll-up commits with the sale that
 * caused it — otherwise a rolled-back sale leaves its revenue behind.
 */
export async function bumpDailyMetric(ctx, branchId, date, delta, session = null) {
  const inc = {};
  for (const k of NUMERIC) {
    if (delta[k]) inc[k] = money(delta[k]);
  }
  for (const m of METHODS) {
    if (delta.payments?.[m]) inc[`paymentSplit.${m}`] = money(delta.payments[m]);
  }
  if (!Object.keys(inc).length) return;
  await DailyMetric.findOneAndUpdate(
    { businessId: ctx.businessId, branchId, date },
    { $inc: inc, $setOnInsert: { accountId: ctx.accountId } },
    { upsert: true, session }
  );
}

/**
 * Recomputes the pre-rolled metrics for a date range straight from the source
 * rows (sales, approved returns, expenses) and overwrites them.
 *
 * The incremental path above is the fast one, but any lost increment is
 * permanent — dashboards would stay wrong forever with no way back. This is
 * that way back: an owner can rebuild a range and get numbers that provably
 * match the sales list. Days in range with no activity are zeroed, not left
 * stale.
 *
 * Returns { days, branches, rebuilt } for the caller to report.
 */
export async function rebuildDailyMetrics({ accountId, businessId, from, to }) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(new Date(`${to}T00:00:00`).getTime() + 24 * 3600 * 1000);
  const inRange = { businessId, at: { $gte: start, $lt: end } };

  // key = `${branchId}|${YYYY-MM-DD}` — one accumulator per branch-day.
  const acc = new Map();
  const bucket = (branchId, date) => {
    const key = `${branchId}|${date}`;
    if (!acc.has(key)) {
      acc.set(key, {
        branchId,
        date,
        revenue: 0, cost: 0, profit: 0, txns: 0,
        discountTotal: 0, vatTotal: 0, refundTotal: 0, expenses: 0,
        paymentSplit: { cash: 0, pos: 0, transfer: 0 },
      });
    }
    return acc.get(key);
  };

  // 1. Completed sales. Voided ones contribute nothing — that is the whole
  //    point of keeping them flagged rather than deleted.
  const sales = await Sale.find({ ...inRange, status: "completed" })
    .select("branchId at total vat discount items payments")
    .lean();
  for (const s of sales) {
    const b = bucket(String(s.branchId), localDay(s.at));
    const cost = s.items.reduce((sum, i) => sum + (i.lineCost || 0), 0);
    b.revenue += s.total;
    b.cost += cost;
    b.profit += s.total - s.vat - cost;
    b.txns += 1;
    b.discountTotal += s.discount;
    b.vatTotal += s.vat;
    for (const p of s.payments || []) {
      if (METHODS.includes(p.method)) b.paymentSplit[p.method] += p.amount;
    }
  }

  // 2. Approved returns, bucketed by the day they were APPROVED (that is when
  //    the money actually moved, and what the incremental path recorded).
  const returns = await Return.find({
    businessId,
    status: "approved",
    decidedAt: { $gte: start, $lt: end },
  })
    .select("branchId decidedAt items refund")
    .lean();
  for (const r of returns) {
    const b = bucket(String(r.branchId), localDay(r.decidedAt));
    const costBack = r.items.reduce((sum, i) => sum + (i.unitCost || 0) * i.qty, 0);
    b.revenue -= r.refund.amount;
    b.cost -= costBack;
    b.profit -= r.refund.amount - costBack;
    b.refundTotal += r.refund.amount;
    if (METHODS.includes(r.refund.method)) b.paymentSplit[r.refund.method] -= r.refund.amount;
  }

  // 3. Expenses — kept apart from profit; dashboards subtract them themselves.
  const expenses = await Expense.find(inRange).select("branchId at amount").lean();
  for (const e of expenses) {
    bucket(String(e.branchId), localDay(e.at)).expenses += e.amount;
  }

  // Overwrite every stored day in range, including ones that should now be
  // empty — a stale row left behind is exactly the drift we are fixing.
  const touched = new Set([...acc.keys()]);
  const stale = await DailyMetric.find({ businessId, date: { $gte: from, $lte: to } }).select("branchId date").lean();
  for (const row of stale) {
    const key = `${row.branchId}|${row.date}`;
    if (!touched.has(key)) bucket(String(row.branchId), row.date); // all zeros
  }

  const ops = [...acc.values()].map((v) => ({
    updateOne: {
      filter: { businessId, branchId: v.branchId, date: v.date },
      update: {
        $set: {
          revenue: money(v.revenue), cost: money(v.cost), profit: money(v.profit),
          txns: v.txns, discountTotal: money(v.discountTotal), vatTotal: money(v.vatTotal),
          refundTotal: money(v.refundTotal), expenses: money(v.expenses),
          paymentSplit: {
            cash: money(v.paymentSplit.cash),
            pos: money(v.paymentSplit.pos),
            transfer: money(v.paymentSplit.transfer),
          },
        },
        $setOnInsert: { accountId },
      },
      upsert: true,
    },
  }));
  if (ops.length) await DailyMetric.bulkWrite(ops);

  return {
    rebuilt: ops.length,
    days: new Set([...acc.values()].map((v) => v.date)).size,
    branches: new Set([...acc.values()].map((v) => v.branchId)).size,
    sales: sales.length,
    returns: returns.length,
    expenses: expenses.length,
  };
}
