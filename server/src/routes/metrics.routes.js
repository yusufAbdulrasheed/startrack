import { Router } from "express";
import { DailyMetric } from "../models/DailyMetric.js";
import { Sale } from "../models/Sale.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { requirePerm, canSeeCost } from "../middleware/tenant.js";
import { localDay } from "../lib/metrics.js";
import { money } from "../lib/money.js";

export const metricsRouter = Router();

function dayOffset(base, days) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d);
}

// GET /api/metrics/sales-report?days=30 — the Sales tab: trend + breakdowns
metricsRouter.get("/sales-report", requirePerm("dashboard_ops"), async (req, res) => {
  const daysBack = Math.min(Math.max(Number(req.query.days) || 30, 7), 90);
  const branchFilter = req.ctx.branchId ? { branchId: req.ctx.branchId } : {};
  const today = localDay();
  const days = [...Array(daysBack)].map((_, i) => dayOffset(today, i - (daysBack - 1)));
  const showFinance = canSeeCost(req.ctx);

  const rows = await DailyMetric.find({ businessId: req.ctx.businessId, ...branchFilter, date: { $gte: days[0] } });
  const byDate = new Map();
  for (const r of rows) {
    const acc = byDate.get(r.date) || { revenue: 0, profit: 0, txns: 0, expenses: 0 };
    acc.revenue += r.revenue;
    acc.profit += r.profit - r.expenses;
    acc.txns += r.txns;
    acc.expenses += r.expenses;
    byDate.set(r.date, acc);
  }

  const since = new Date(`${days[0]}T00:00:00`);
  const saleMatch = { businessId: req.ctx.businessId, ...branchFilter, at: { $gte: since }, status: "completed" };

  const byStaff = await Sale.aggregate([
    { $match: saleMatch },
    { $group: { _id: "$staffId", name: { $first: "$staffName" }, sales: { $sum: 1 }, revenue: { $sum: "$total" } } },
    { $sort: { revenue: -1 } },
    { $limit: 10 },
  ]);

  const byCategory = await Sale.aggregate([
    { $match: saleMatch },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "product" } },
    { $group: { _id: { $ifNull: [{ $first: "$product.category" }, "Other"] }, sold: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineNet" } } },
    { $sort: { revenue: -1 } },
    { $limit: 8 },
  ]);

  const byMethod = await Sale.aggregate([
    { $match: saleMatch },
    { $unwind: "$payments" },
    { $group: { _id: "$payments.method", amount: { $sum: "$payments.amount" } } },
  ]);

  const totals = days.reduce(
    (acc, d) => {
      const m = byDate.get(d);
      if (m) { acc.revenue += m.revenue; acc.txns += m.txns; acc.profit += m.profit; acc.expenses += m.expenses; }
      return acc;
    },
    { revenue: 0, txns: 0, profit: 0, expenses: 0 }
  );

  res.json({
    days: daysBack,
    totals: {
      revenue: money(totals.revenue),
      txns: totals.txns,
      avgSale: totals.txns > 0 ? money(totals.revenue / totals.txns) : 0,
      ...(showFinance ? { profit: money(totals.profit), expenses: money(totals.expenses) } : {}),
    },
    series: days.map((d) => ({
      date: d,
      revenue: money(byDate.get(d)?.revenue || 0),
      txns: byDate.get(d)?.txns || 0,
      ...(showFinance ? { profit: money(byDate.get(d)?.profit || 0) } : {}),
    })),
    byStaff: byStaff.map((s) => ({ name: s.name, sales: s.sales, revenue: money(s.revenue) })),
    byCategory: byCategory.map((c) => ({ category: c._id, sold: c.sold, revenue: money(c.revenue) })),
    byMethod: byMethod.map((m) => ({ method: m._id, amount: money(m.amount) })),
  });
});

// GET /api/metrics/inventory-report — the Inventory tab: value, gaps, expiry
metricsRouter.get("/inventory-report", requirePerm("dashboard_ops", "stock"), async (req, res) => {
  const showFinance = canSeeCost(req.ctx);
  const products = await Product.find({ businessId: req.ctx.businessId, status: "active" })
    .select("name category price cost reorderLevel expiry");
  const invFilter = req.ctx.branchId
    ? { branchId: req.ctx.branchId }
    : { businessId: req.ctx.businessId };
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

  res.json({
    skus: products.length,
    units,
    retailValue: money(retailValue),
    ...(showFinance ? { costValue: money(costValue), potentialProfit: money(retailValue - costValue) } : {}),
    lowStock: lowStock.slice(0, 15),
    expiringSoon: expiringSoon.slice(0, 15),
  });
});

// GET /api/metrics/dashboard — everything the dashboard needs in one call.
// Owner/admin with no branch selected sees the whole business consolidated.
metricsRouter.get("/dashboard", requirePerm("dashboard_ops"), async (req, res) => {
  const branchFilter = req.ctx.branchId ? { branchId: req.ctx.branchId } : {};
  const scope = { businessId: req.ctx.businessId, ...branchFilter };
  const today = localDay();
  const days = [...Array(7)].map((_, i) => dayOffset(today, i - 6));
  const prevDays = [...Array(7)].map((_, i) => dayOffset(today, i - 13));
  const showFinance = canSeeCost(req.ctx);

  const rows = await DailyMetric.find({ ...scope, date: { $gte: prevDays[0] } });
  const byDate = new Map();
  for (const r of rows) {
    const acc = byDate.get(r.date) || {
      revenue: 0, cost: 0, profit: 0, txns: 0, discountTotal: 0, vatTotal: 0,
      refundTotal: 0, expenses: 0, cash: 0, pos: 0, transfer: 0,
    };
    acc.revenue += r.revenue; acc.cost += r.cost; acc.profit += r.profit; acc.txns += r.txns;
    acc.discountTotal += r.discountTotal; acc.vatTotal += r.vatTotal;
    acc.refundTotal += r.refundTotal; acc.expenses += r.expenses;
    acc.cash += r.paymentSplit?.cash || 0; acc.pos += r.paymentSplit?.pos || 0; acc.transfer += r.paymentSplit?.transfer || 0;
    byDate.set(r.date, acc);
  }
  const zero = { revenue: 0, cost: 0, profit: 0, txns: 0, discountTotal: 0, vatTotal: 0, refundTotal: 0, expenses: 0, cash: 0, pos: 0, transfer: 0 };
  const todayM = byDate.get(today) || zero;
  const yesterdayM = byDate.get(dayOffset(today, -1)) || zero;

  const sum = (dates, key) => money(dates.reduce((s, d) => s + (byDate.get(d)?.[key] || 0), 0));
  const weekRevenue = sum(days, "revenue");
  const prevWeekRevenue = sum(prevDays, "revenue");

  // Top products over the last 7 days (aggregation over the window only).
  const since = new Date(`${days[0]}T00:00:00`);
  const top = await Sale.aggregate([
    { $match: { businessId: req.ctx.businessId, ...(req.ctx.branchId ? { branchId: req.ctx.branchId } : {}), at: { $gte: since }, status: "completed" } },
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

  // Low stock for the active branch (consolidated view skips it).
  let lowStock = [];
  if (req.ctx.branchId) {
    const products = await Product.find({ businessId: req.ctx.businessId, status: "active" }).select("name reorderLevel");
    const inv = await Inventory.find({ branchId: req.ctx.branchId, productId: { $in: products.map((p) => p._id) } });
    const stockBy = new Map(inv.map((i) => [String(i.productId), i.stock]));
    lowStock = products
      .map((p) => ({ id: p._id, name: p.name, stock: stockBy.get(String(p._id)) ?? 0, reorderLevel: p.reorderLevel }))
      .filter((p) => p.stock <= p.reorderLevel)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8);
  }

  const recent = await Sale.find({ businessId: req.ctx.businessId, ...branchFilter })
    .sort({ at: -1 })
    .limit(8)
    .select("saleNo at staffName total payments status items.name items.qty");

  const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : now > 0 ? 100 : 0);

  res.json({
    today: {
      revenue: money(todayM.revenue),
      txns: todayM.txns,
      ...(showFinance ? { profit: money(todayM.profit - todayM.expenses), cost: money(todayM.cost), expenses: money(todayM.expenses) } : {}),
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
  });
});
