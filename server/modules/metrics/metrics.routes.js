import { Router } from "express";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Attendance } from "#modules/staff/attendance.model.js";
import { requirePerm, canSeeCost } from "#core/middleware/tenant.js";
import { localDay, dayOffset, rebuildDailyMetrics, buildInventoryReport, buildDashboardSummary } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";

export const metricsRouter = Router();

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
  res.json(await buildInventoryReport(req.ctx));
});

// GET /api/metrics/customers-report — the Customers tab
metricsRouter.get("/customers-report", requirePerm("dashboard_ops"), async (req, res) => {
  const scope = { businessId: req.ctx.businessId };
  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const total = await Customer.countDocuments(scope);
  const newThisMonth = await Customer.countDocuments({ ...scope, firstSeen: { $gte: since30 } });
  const repeat = await Customer.countDocuments({ ...scope, visits: { $gte: 2 } });
  const active30 = await Customer.countDocuments({ ...scope, lastSeen: { $gte: since30 } });

  const top = await Customer.find(scope).sort({ totalSpend: -1 }).limit(10).select("name phone totalSpend visits lastSeen");
  const recent = await Customer.find(scope).sort({ firstSeen: -1 }).limit(8).select("name phone totalSpend visits firstSeen");

  res.json({
    totals: {
      customers: total,
      newLast30: newThisMonth,
      activeLast30: active30,
      repeatRate: total > 0 ? Math.round((repeat / total) * 100) : 0,
    },
    topSpenders: top.map((c) => ({ id: c._id, name: c.name, phone: c.phone, totalSpend: c.totalSpend, visits: c.visits, lastSeen: c.lastSeen })),
    newest: recent.map((c) => ({ id: c._id, name: c.name, phone: c.phone, totalSpend: c.totalSpend, visits: c.visits, firstSeen: c.firstSeen })),
  });
});

// GET /api/metrics/staff-report — the Staff tab (30-day window)
metricsRouter.get("/staff-report", requirePerm("dashboard_ops"), async (req, res) => {
  const branchFilter = req.ctx.branchId ? { branchId: req.ctx.branchId } : {};
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const sinceDay = localDay(since);

  const perf = await Sale.aggregate([
    { $match: { businessId: req.ctx.businessId, ...branchFilter, at: { $gte: since } } },
    {
      $group: {
        _id: "$staffId",
        name: { $first: "$staffName" },
        sales: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        voids: { $sum: { $cond: [{ $eq: ["$status", "voided"] }, 1, 0] } },
        revenue: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$total", 0] } },
        discounts: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$discount", 0] } },
      },
    },
    { $sort: { revenue: -1 } },
  ]);

  const hours = await Attendance.aggregate([
    { $match: { businessId: req.ctx.businessId, ...branchFilter, date: { $gte: sinceDay } } },
    { $group: { _id: "$userId", name: { $first: "$staffName" }, hours: { $sum: "$hours" }, shifts: { $sum: 1 } } },
  ]);
  const hoursBy = new Map(hours.map((h) => [String(h._id), h]));

  const staff = perf.map((p) => {
    const h = hoursBy.get(String(p._id));
    if (h) hoursBy.delete(String(p._id));
    return {
      name: p.name,
      sales: p.sales,
      voids: p.voids,
      revenue: money(p.revenue),
      discounts: money(p.discounts),
      avgSale: p.sales > 0 ? money(p.revenue / p.sales) : 0,
      hours: h ? money(h.hours) : 0,
      shifts: h ? h.shifts : 0,
    };
  });
  // Staff who clocked in but sold nothing still show up.
  for (const h of hoursBy.values()) {
    staff.push({ name: h.name, sales: 0, voids: 0, revenue: 0, discounts: 0, avgSale: 0, hours: money(h.hours), shifts: h.shifts });
  }

  res.json({ days: 30, staff });
});

// GET /api/metrics/dashboard — everything the dashboard needs in one call.
// Owner/admin with no branch selected sees the whole business consolidated.
metricsRouter.get("/dashboard", requirePerm("dashboard_ops"), async (req, res) => {
  res.json(await buildDashboardSummary(req.ctx));
});

// POST /api/metrics/rebuild — recompute the pre-rolled numbers for a range
// straight from the sales, returns and expenses that caused them.
//
// The incremental roll-up is fast but unforgiving: an increment lost to a
// crash is lost for good, and the dashboard would disagree with the sales
// list forever. This is the repair. It is owner-level because it rewrites
// what everyone else reads, and it is capped at a year per call.
metricsRouter.post("/rebuild", requirePerm("dashboard_finance"), async (req, res) => {
  const today = localDay();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.to || "") ? req.body.to : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.from || "") ? req.body.from : dayOffset(to, -29);
  if (from > to) return res.status(400).json({ error: "invalid", message: "The start date is after the end date." });
  const spanDays = Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);
  if (spanDays > 366) return res.status(400).json({ error: "range_too_wide", message: "Rebuild at most a year at a time." });

  const result = await rebuildDailyMetrics({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    from,
    to,
  });

  audit(req.ctx, "metrics.rebuild", { type: "metrics", label: `${from} → ${to}` }, undefined, result);
  res.json({ from, to, ...result });
});
