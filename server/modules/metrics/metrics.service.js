import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Return } from "#modules/returns/return.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { canSeeCost } from "#core/middleware/tenant.js";
import { money } from "#core/money.js";


export function localDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const NUMERIC = ["revenue", "cost", "profit", "txns", "discountTotal", "vatTotal", "refundTotal", "wasteTotal", "expenses"];
const METHODS = ["cash", "pos", "transfer"];


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


export function dayOffset(base, days) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d);
}

/**
 * Stock value, gaps and movement — exactly what GET /metrics/inventory-report
 * returns. Extracted so the AI restock-suggestion prompt (server/modules/ai/)
 * and the human-facing report route share one implementation instead of two
 * copies of the same low-stock/velocity math drifting apart.
 */
export async function buildInventoryReport(ctx) {
  const showFinance = canSeeCost(ctx);
  const products = await Product.find({ businessId: ctx.businessId, status: "active", archetype: { $ne: "made_to_order" } })
    .select("name category price cost reorderLevel expiry");
  const invFilter = ctx.branchId ? { branchId: ctx.branchId } : { businessId: ctx.businessId };
  const inv = await Inventory.find({ ...invFilter, productId: { $in: products.map((p) => p._id) } });

  const stockBy = new Map();
  for (const i of inv) {
    stockBy.set(String(i.productId), (stockBy.get(String(i.productId)) || 0) + i.stock);
  }

  let units = 0, retailValue = 0, costValue = 0;
  const lowStock = [];
  const expiringSoon = [];
  const soonCutoff = new Date(Date.now() + 30 * 24 * 3600 * 1000);

  for (const p of products) {
    const stock = stockBy.get(String(p._id)) ?? 0;
    units += stock;
    retailValue += stock * p.price;
    costValue += stock * (p.cost || 0);
    if (stock <= p.reorderLevel) {
      lowStock.push({ id: p._id, name: p.name, stock, reorderLevel: p.reorderLevel });
    }
    if (p.expiry && stock > 0 && p.expiry <= soonCutoff) {
      expiringSoon.push({ id: p._id, name: p.name, stock, expiry: p.expiry, expired: p.expiry < new Date() });
    }
  }
  lowStock.sort((a, b) => a.stock - b.stock);
  expiringSoon.sort((a, b) => new Date(a.expiry) - new Date(b.expiry));

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const moveBranch = ctx.branchId ? { branchId: ctx.branchId } : {};
  const flows = await StockMovement.aggregate([
    { $match: { businessId: ctx.businessId, ...moveBranch, at: { $gte: since } } },
    {
      $group: {
        _id: "$productId",
        name: { $first: "$productName" },
        unitsIn: { $sum: { $cond: [{ $gt: ["$qty", 0] }, "$qty", 0] } },
        unitsOut: { $sum: { $cond: [{ $lt: ["$qty", 0] }, { $abs: "$qty" }, 0] } },
      },
    },
  ]);
  let unitsIn = 0, unitsOut = 0;
  for (const f of flows) { unitsIn += f.unitsIn; unitsOut += f.unitsOut; }
  const topMovers = [...flows].sort((a, b) => b.unitsOut - a.unitsOut).slice(0, 10)
    .map((f) => ({ id: f._id, name: f.name, unitsIn: f.unitsIn, unitsOut: f.unitsOut }));

  return {
    skus: products.length,
    units,
    retailValue: money(retailValue),
    ...(showFinance ? { costValue: money(costValue), potentialProfit: money(retailValue - costValue) } : {}),
    flow30d: { unitsIn, unitsOut },
    turnover: units > 0 ? Math.round((unitsOut / units) * 100) / 100 : 0,
    topMovers,
    lowStock: lowStock.slice(0, 15),
    expiringSoon: expiringSoon.slice(0, 15),
  };
}

/**
 * Everything the Dashboard's overview needs in one call — exactly what
 * GET /metrics/dashboard returns. Extracted for the same reason as
 * buildInventoryReport above: the AI digest and Ask-AI chat ground their
 * answers in this same summary, not a second hand-rolled aggregation.
 */
export async function buildDashboardSummary(ctx) {
  const branchFilter = ctx.branchId ? { branchId: ctx.branchId } : {};
  const scope = { businessId: ctx.businessId, ...branchFilter };
  const today = localDay();
  const days = [...Array(7)].map((_, i) => dayOffset(today, i - 6));
  const prevDays = [...Array(7)].map((_, i) => dayOffset(today, i - 13));
  const showFinance = canSeeCost(ctx);

  const rows = await DailyMetric.find({ ...scope, date: { $gte: prevDays[0] } });
  const byDate = new Map();
  for (const r of rows) {
    const acc = byDate.get(r.date) || {
      revenue: 0, cost: 0, profit: 0, txns: 0, discountTotal: 0, vatTotal: 0,
      refundTotal: 0, wasteTotal: 0, expenses: 0, cash: 0, pos: 0, transfer: 0,
    };
    acc.revenue += r.revenue; acc.cost += r.cost; acc.profit += r.profit; acc.txns += r.txns;
    acc.discountTotal += r.discountTotal; acc.vatTotal += r.vatTotal;
    acc.refundTotal += r.refundTotal; acc.wasteTotal += r.wasteTotal || 0; acc.expenses += r.expenses;
    acc.cash += r.paymentSplit?.cash || 0; acc.pos += r.paymentSplit?.pos || 0; acc.transfer += r.paymentSplit?.transfer || 0;
    byDate.set(r.date, acc);
  }
  const zero = { revenue: 0, cost: 0, profit: 0, txns: 0, discountTotal: 0, vatTotal: 0, refundTotal: 0, wasteTotal: 0, expenses: 0, cash: 0, pos: 0, transfer: 0 };
  const todayM = byDate.get(today) || zero;
  const yesterdayM = byDate.get(dayOffset(today, -1)) || zero;

  const sum = (dates, key) => money(dates.reduce((s, d) => s + (byDate.get(d)?.[key] || 0), 0));
  const weekRevenue = sum(days, "revenue");
  const prevWeekRevenue = sum(prevDays, "revenue");

  const since = new Date(`${days[0]}T00:00:00`);
  const top = await Sale.aggregate([
    { $match: { businessId: ctx.businessId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}), at: { $gte: since }, status: "completed" } },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.productId",
        name: { $first: "$items.name" },
        sold: { $sum: "$items.qty" },
        revenue: { $sum: "$items.lineNet" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ]);

  let lowStock = [];
  if (ctx.branchId) {
    const products = await Product.find({ businessId: ctx.businessId, status: "active", archetype: { $ne: "made_to_order" } }).select("name reorderLevel");
    const inv = await Inventory.find({ branchId: ctx.branchId, productId: { $in: products.map((p) => p._id) } });
    const stockBy = new Map(inv.map((i) => [String(i.productId), i.stock]));
    lowStock = products
      .map((p) => ({ id: p._id, name: p.name, stock: stockBy.get(String(p._id)) ?? 0, reorderLevel: p.reorderLevel }))
      .filter((p) => p.stock <= p.reorderLevel)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8);
  }

  const recent = await Sale.find({ businessId: ctx.businessId, ...branchFilter })
    .sort({ at: -1 })
    .limit(8)
    .select("saleNo at staffName total payments status items.name items.qty");

  const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : now > 0 ? 100 : 0);

  return {
    today: {
      revenue: money(todayM.revenue),
      txns: todayM.txns,
      ...(showFinance ? { profit: money(todayM.profit - todayM.expenses), cost: money(todayM.cost), expenses: money(todayM.expenses), wasteTotal: money(todayM.wasteTotal) } : {}),
      discountTotal: money(todayM.discountTotal),
      vatTotal: money(todayM.vatTotal),
      refundTotal: money(todayM.refundTotal),
      deltas: {
        revenue: pct(todayM.revenue, yesterdayM.revenue),
        txns: pct(todayM.txns, yesterdayM.txns),
        ...(showFinance ? { profit: pct(todayM.profit, yesterdayM.profit) } : {}),
      },
    },
    series7d: days.map((d) => ({
      date: d,
      revenue: money(byDate.get(d)?.revenue || 0),
      txns: byDate.get(d)?.txns || 0,
      ...(showFinance ? { profit: money(byDate.get(d)?.profit || 0) } : {}),
    })),
    week: { revenue: weekRevenue, deltaPct: pct(weekRevenue, prevWeekRevenue) },
    paymentSplit: { cash: money(todayM.cash), pos: money(todayM.pos), transfer: money(todayM.transfer) },
    topProducts: top.map((t) => ({ id: t._id, name: t.name, sold: t.sold, revenue: money(t.revenue) })),
    lowStock,
    recentSales: recent.map((s) => ({
      id: s._id,
      saleNo: s.saleNo,
      at: s.at,
      staffName: s.staffName,
      total: s.total,
      method: s.payments[0]?.method || "cash",
      split: s.payments.length > 1,
      status: s.status,
      summary: s.items.map((i) => `${i.name} ×${i.qty}`).join(", "),
    })),
  };
}

export async function rebuildDailyMetrics({ accountId, businessId, from, to }) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(new Date(`${to}T00:00:00`).getTime() + 24 * 3600 * 1000);
  const inRange = { businessId, at: { $gte: start, $lt: end } };

  
  const acc = new Map();
  const bucket = (branchId, date) => {
    const key = `${branchId}|${date}`;
    if (!acc.has(key)) {
      acc.set(key, {
        branchId,
        date,
        revenue: 0, cost: 0, profit: 0, txns: 0,
        discountTotal: 0, vatTotal: 0, refundTotal: 0, wasteTotal: 0, expenses: 0,
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

  // 3. Waste — never sold, so no revenue/cost to reverse, just a straight
  //    profit hit valued at each movement's own snapshotted unitCost (not
  //    the product's current cost, which may have moved on since).
  const waste = await StockMovement.find({ ...inRange, refType: "waste" }).select("branchId at qty unitCost").lean();
  for (const w of waste) {
    const b = bucket(String(w.branchId), localDay(w.at));
    const value = Math.abs(w.qty) * (w.unitCost || 0);
    b.wasteTotal += value;
    b.profit -= value;
  }

  // 4. Expenses — kept apart from profit; dashboards subtract them themselves.
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
          refundTotal: money(v.refundTotal), wasteTotal: money(v.wasteTotal), expenses: money(v.expenses),
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
    waste: waste.length,
    expenses: expenses.length,
  };
}
