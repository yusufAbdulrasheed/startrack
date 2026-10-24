import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { StockCount } from "#modules/inventory/stockCount.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Return } from "#modules/returns/return.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Job } from "#modules/jobs/job.model.js";
import { Serial } from "#modules/businesses/electronics/serial.model.js";
import { ProductionRun } from "#modules/production/productionRun.model.js";
import { VaccinationRecord } from "#modules/businesses/poultry/vaccination.model.js";
import { Cohort } from "#modules/businesses/poultry/cohort.model.js";
import { Supplier } from "#modules/suppliers/supplier.model.js";
import { Room } from "#modules/businesses/hotel/room.model.js";
import { staysOverlapping, shapeStay, addDays } from "#modules/businesses/hotel/hotel.service.js";
import { ColdRoomBatch } from "#modules/businesses/coldroom/batch.model.js";
import { ColdRoomBreakdown } from "#modules/businesses/coldroom/breakdown.model.js";
import { poolsFromBatches, costPerKgOfBatch } from "#modules/businesses/coldroom/coldroom.service.js";
import { GymSubscription } from "#modules/businesses/gym/gymSubscription.model.js";
import { GymCheckIn } from "#modules/businesses/gym/gymCheckIn.model.js";
import { Intake } from "#modules/businesses/academy/intake.model.js";
import { Enrollment } from "#modules/businesses/academy/enrollment.model.js";
import { buildAcademyOverview } from "#modules/businesses/academy/academy.routes.js";
import { Appointment } from "#modules/businesses/salon/appointment.model.js";
import { buildSalonOverview } from "#modules/businesses/salon/salon.routes.js";
import { Project } from "#modules/businesses/agency/project.model.js";
import { buildAgencyOverview } from "#modules/businesses/agency/agency.routes.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { Attendance } from "#modules/staff/attendance.model.js";
import { Ticket } from "#modules/support/ticket.model.js";
import { AuditLog } from "#modules/audit/auditLog.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { canSeeCost } from "#core/middleware/tenant.js";
import { money } from "#core/money.js";
import { typeTemplate } from "#shared/businessTypes.js";
import {
  buildInventoryReport, buildCustomersReport, buildStaffReport, localDay,
} from "#modules/metrics/metrics.service.js";

/**
 * The AI's eyes, one screen at a time.
 *
 * Every module the app has gets an entry: who may ask about it (the SAME
 * permission its page needs), a one-line brief of what the screen is for and
 * how to advise on it, and a builder returning the live facts behind it. The
 * builders are deliberately compact (top-N lists, counts, percentages) — the
 * model reasons over summaries, and every figure it quotes must be one of
 * these. They respect the caller's role: cost and margin appear only when
 * canSeeCost(ctx), and a till user without dashboard rights sees only their
 * own sales, exactly as the real screens do.
 */

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const can = (ctx, ...perms) => ctx.perms.includes("*") || perms.some((p) => ctx.perms.includes(p));
const branchOf = (ctx) => (ctx.branchId ? { branchId: ctx.branchId } : {});
const ageDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY));
const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Stock on hand per product for the active branch (or summed across branches). */
async function stockMap(ctx, productIds) {
  const filter = ctx.branchId ? { branchId: ctx.branchId } : { businessId: ctx.businessId };
  const inv = await Inventory.find({ ...filter, ...(productIds ? { productId: { $in: productIds } } : {}) }).lean();
  const m = new Map();
  for (const i of inv) m.set(String(i.productId), (m.get(String(i.productId)) || 0) + i.stock);
  return m;
}

// ── Shared retail screens ────────────────────────────────────────────

async function salesScope(ctx, days) {
  const canOps = can(ctx, "dashboard_ops");
  return {
    businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(days) },
    ...(canOps ? {} : { staffId: ctx.userId }), // a till user only ever sees their own sales
  };
}

async function buildSales(ctx) {
  const match = await salesScope(ctx, 7);
  const sales = await Sale.find(match).select("saleNo at total discount vat status payments staffName voidInfo service items.name").lean();
  const done = sales.filter((s) => s.status === "completed");
  const voided = sales.filter((s) => s.status === "voided");
  const byMethod = {};
  for (const s of done) for (const p of s.payments) byMethod[p.method] = money((byMethod[p.method] || 0) + p.amount);
  const byHour = {};
  for (const s of done) { const h = new Date(s.at).getHours(); byHour[h] = (byHour[h] || 0) + 1; }
  const peak = Object.entries(byHour).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => ({ hour: `${h}:00`, sales: n }));
  const revenue = money(done.reduce((n, s) => n + s.total, 0));
  return {
    window: "last 7 days",
    sales: done.length, revenue, avgSale: done.length ? money(revenue / done.length) : 0,
    discountGiven: money(done.reduce((n, s) => n + s.discount, 0)),
    discountedSales: done.filter((s) => s.discount > 0).length,
    byPaymentMethod: byMethod, peakHours: peak,
    voidedCount: voided.length, voidRatePct: pct(voided.length, sales.length),
    recentVoids: voided.slice(0, 6).map((s) => ({ saleNo: s.saleNo, total: s.total, by: s.voidInfo?.byName, reason: s.voidInfo?.reason })),
    servicePayments: done.filter((s) => s.service?.kind).length,
    note: "Sales for service businesses (fees, deposits, project payments) appear here as single-line receipts.",
  };
}

async function buildPos(ctx) {
  const match = await salesScope(ctx, 7);
  // "What's selling?" is useful to every cashier, so the top sellers cover the
  // whole branch — but only the owner/manager-level view gets the money; a till
  // user gets units sold, never other people's takings.
  const branchWide = { businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(7) }, status: "completed" };
  const [top, inv] = await Promise.all([
    Sale.aggregate([
      { $match: branchWide },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", sold: { $sum: "$items.qty" }, revenue: { $sum: "$items.lineNet" } } },
      { $sort: { sold: -1 } }, { $limit: 8 },
    ]),
    buildInventoryReport(ctx),
  ]);
  const today = await Sale.aggregate([
    { $match: { ...match, status: "completed", at: { $gte: new Date(`${localDay()}T00:00:00`) } } },
    { $group: { _id: null, n: { $sum: 1 }, revenue: { $sum: "$total" } } },
  ]);
  return {
    today: { sales: today[0]?.n || 0, revenue: money(today[0]?.revenue || 0) },
    topSellers7d: top.map((t) => ({ name: t._id, sold: t.sold, ...(can(ctx, "dashboard_ops") ? { revenue: money(t.revenue) } : {}) })),
    runningLow: inv.lowStock.slice(0, 10), expiringSoon: inv.expiringSoon.slice(0, 6),
  };
}

async function buildProducts(ctx) {
  const showCost = canSeeCost(ctx);
  const products = await Product.find({ businessId: ctx.businessId, status: "active" })
    .select("name category price cost archetype expiry reorderLevel tracksSerials").lean();
  const stock = await stockMap(ctx);
  const physical = products.filter((p) => p.archetype !== "made_to_order");
  const soon = Date.now() + 30 * DAY;
  const out = {
    products: products.length, madeToOrder: products.length - physical.length,
    categories: Object.entries(products.reduce((a, p) => ((a[p.category] = (a[p.category] || 0) + 1), a), {})).map(([name, n]) => ({ name, n })),
    outOfStock: physical.filter((p) => (stock.get(String(p._id)) ?? 0) <= 0).slice(0, 12).map((p) => p.name),
    zeroPrice: products.filter((p) => !p.price).slice(0, 8).map((p) => p.name),
    expiringWithin30d: physical.filter((p) => p.expiry && new Date(p.expiry).getTime() <= soon && (stock.get(String(p._id)) ?? 0) > 0)
      .slice(0, 10).map((p) => ({ name: p.name, expiry: fmtDay(p.expiry), stock: stock.get(String(p._id)) })),
  };
  if (showCost) {
    const priced = physical.filter((p) => p.price > 0 && p.cost > 0).map((p) => ({ name: p.name, price: p.price, cost: p.cost, marginPct: pct(p.price - p.cost, p.price) }));
    out.lowestMargins = priced.sort((a, b) => a.marginPct - b.marginPct).slice(0, 8);
    out.highestMargins = [...priced].sort((a, b) => b.marginPct - a.marginPct).slice(0, 5);
    out.missingCost = physical.filter((p) => !p.cost).length;
    out.soldBelowCost = priced.filter((p) => p.marginPct < 0).map((p) => p.name).slice(0, 8);
  }
  return out;
}

async function buildStockIn(ctx) {
  const showCost = canSeeCost(ctx);
  const rows = await StockMovement.find({ businessId: ctx.businessId, ...branchOf(ctx), type: "IN", at: { $gte: daysAgo(30) } })
    .sort({ at: -1 }).limit(60).lean();
  const bySupplier = {};
  for (const r of rows) {
    const k = r.supplierName || "(no supplier recorded)";
    const e = (bySupplier[k] ||= { deliveries: 0, units: 0, spend: 0 });
    e.deliveries += 1; e.units += r.qty; e.spend += (r.unitCost || 0) * r.qty;
  }
  const inv = await buildInventoryReport(ctx);
  return {
    window: "last 30 days", deliveries: rows.length,
    recent: rows.slice(0, 12).map((r) => ({ product: r.productName, qty: r.qty, at: fmtDay(r.at), supplier: r.supplierName || null, ...(showCost && r.unitCost ? { unitCost: r.unitCost } : {}) })),
    bySupplier: Object.entries(bySupplier).map(([name, e]) => ({ name, deliveries: e.deliveries, units: e.units, ...(showCost ? { spend: money(e.spend) } : {}) })),
    runningLow: inv.lowStock.slice(0, 10),
  };
}

async function buildTransfers(ctx) {
  const rows = await StockMovement.find({ businessId: ctx.businessId, type: { $in: ["TRANSFER_IN", "TRANSFER_OUT"] }, at: { $gte: daysAgo(30) } })
    .sort({ at: -1 }).limit(40).lean();
  const branches = await Branch.find({ businessId: ctx.businessId }).select("name").lean();
  const name = new Map(branches.map((b) => [String(b._id), b.name]));
  return {
    window: "last 30 days", branches: branches.map((b) => b.name), movements: rows.length,
    recent: rows.slice(0, 12).map((r) => ({ product: r.productName, qty: r.qty, direction: r.type === "TRANSFER_IN" ? "in" : "out", branch: name.get(String(r.branchId)), at: fmtDay(r.at) })),
  };
}

async function buildReturns(ctx) {
  const rows = await Return.find({ businessId: ctx.businessId, ...branchOf(ctx), createdAt: { $gte: daysAgo(30) } }).lean();
  const byStatus = (s) => rows.filter((r) => r.status === s);
  const reasons = {};
  for (const r of rows) { const k = (r.reason || "").toLowerCase().slice(0, 60); if (k) reasons[k] = (reasons[k] || 0) + 1; }
  const byProduct = {};
  for (const r of rows) for (const i of r.items) byProduct[i.name] = (byProduct[i.name] || 0) + i.qty;
  return {
    window: "last 30 days", total: rows.length, pending: byStatus("pending").length, approved: byStatus("approved").length, rejected: byStatus("rejected").length,
    refundedValue: money(byStatus("approved").reduce((n, r) => n + r.refund.amount, 0)),
    waitingForDecision: byStatus("pending").slice(0, 8).map((r) => ({ saleNo: r.saleNo, amount: r.refund.amount, requestedBy: r.requestedByName, reason: r.reason, waitingDays: ageDays(r.createdAt) })),
    topReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([reason, n]) => ({ reason, n })),
    mostReturnedProducts: Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty })),
  };
}

async function buildJobs(ctx) {
  const open = await Job.find({ businessId: ctx.businessId, ...branchOf(ctx), stage: { $in: ["received", "in_progress", "ready"] } }).lean();
  const now = Date.now();
  const stage = (s) => open.filter((j) => j.stage === s);
  const overdue = open.filter((j) => j.stage !== "ready" && j.promisedAt && new Date(j.promisedAt).getTime() < now);
  const staleReady = stage("ready").filter((j) => j.readyAt && now - new Date(j.readyAt).getTime() > 2 * DAY);
  const recentDone = await Job.countDocuments({ businessId: ctx.businessId, ...branchOf(ctx), stage: "collected", collectedAt: { $gte: daysAgo(30) } });
  return {
    open: open.length, byStage: { received: stage("received").length, in_progress: stage("in_progress").length, ready: stage("ready").length },
    collectedLast30d: recentDone,
    balanceStillToCollect: money(open.reduce((n, j) => n + Math.max(0, (j.total || 0) - (j.deposit || 0)), 0)),
    overdue: overdue.slice(0, 8).map((j) => ({ jobNo: j.jobNo, title: j.title, customer: j.customerName, promised: fmtDay(j.promisedAt), daysLate: ageDays(j.promisedAt), stage: j.stage })),
    readyButUncollected: staleReady.slice(0, 8).map((j) => ({ jobNo: j.jobNo, title: j.title, customer: j.customerName, phone: j.customerPhone, readyDays: ageDays(j.readyAt), balance: money(Math.max(0, (j.total || 0) - (j.deposit || 0))) })),
  };
}

async function buildSuppliers(ctx) {
  const showCost = canSeeCost(ctx);
  const [suppliers, moves] = await Promise.all([
    Supplier.find({ businessId: ctx.businessId }).lean(),
    StockMovement.find({ businessId: ctx.businessId, type: "IN", supplierId: { $ne: null }, at: { $gte: daysAgo(90) } }).select("supplierName productName qty unitCost at").lean(),
  ]);
  const by = new Map();
  for (const m of moves) {
    const e = by.get(m.supplierName) || { deliveries: 0, spend: 0, last: null, products: new Set() };
    e.deliveries += 1; e.spend += (m.unitCost || 0) * m.qty; e.products.add(m.productName); e.last = !e.last || m.at > e.last ? m.at : e.last;
    by.set(m.supplierName, e);
  }
  return {
    suppliers: suppliers.length,
    list: suppliers.map((s) => {
      const e = by.get(s.name);
      return { name: s.name, type: s.type, terms: s.paymentTerms, deliveries90d: e?.deliveries || 0, lastDelivery: fmtDay(e?.last), products: e ? [...e.products].slice(0, 5) : [], ...(showCost && e ? { spend90d: money(e.spend) } : {}) };
    }).slice(0, 15),
    notUsedIn90d: suppliers.filter((s) => !by.has(s.name)).map((s) => s.name).slice(0, 8),
  };
}

async function buildStockCount(ctx) {
  const counts = await StockCount.find({ businessId: ctx.businessId, ...branchOf(ctx) }).sort({ at: -1 }).limit(5).lean();
  return {
    counts: counts.map((c) => {
      const counted = c.lines.filter((l) => l.countedQty !== null);
      const variances = counted.map((l) => ({ product: l.productName, system: l.systemQty, counted: l.countedQty, variance: l.countedQty - l.systemQty })).filter((v) => v.variance !== 0);
      return {
        countNo: c.countNo, status: c.status, on: fmtDay(c.at), lines: c.lines.length, counted: counted.length,
        itemsOff: variances.length, unitsShort: variances.filter((v) => v.variance < 0).reduce((n, v) => n + v.variance, 0),
        biggestVariances: variances.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 6),
      };
    }),
    daysSinceLastClosedCount: (() => { const c = counts.find((x) => x.status === "closed"); return c ? ageDays(c.closedAt || c.at) : null; })(),
  };
}

async function buildCustomers(ctx) {
  const report = await buildCustomersReport(ctx);
  const [dormant, owing] = await Promise.all([
    Customer.countDocuments({ businessId: ctx.businessId, totalSpend: { $gt: 0 }, lastSeen: { $lt: daysAgo(60) } }),
    Customer.find({ businessId: ctx.businessId, creditBalance: { $gt: 0 } }).sort({ creditBalance: -1 }).limit(8).select("name phone creditBalance").lean(),
  ]);
  return {
    ...report,
    dormantOver60Days: dormant,
    owingOnCredit: owing.map((c) => ({ name: c.name, phone: c.phone, owes: c.creditBalance })),
    totalOwedOnCredit: money(owing.reduce((n, c) => n + c.creditBalance, 0)),
  };
}

async function buildExpenses(ctx) {
  const rows = await Expense.find({ businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(30) } }).lean();
  const metrics = await DailyMetric.find({ businessId: ctx.businessId, ...branchOf(ctx), date: { $gte: localDay(daysAgo(30)) } }).lean();
  const revenue = money(metrics.reduce((n, m) => n + m.revenue, 0));
  const byType = {};
  for (const e of rows) byType[e.type] = money((byType[e.type] || 0) + e.amount);
  const total = money(rows.reduce((n, e) => n + e.amount, 0));
  return {
    window: "last 30 days", total, revenue, expenseToRevenuePct: pct(total, revenue),
    byType: Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => ({ type, amount, sharePct: pct(amount, total) })),
    largest: [...rows].sort((a, b) => b.amount - a.amount).slice(0, 5).map((e) => ({ type: e.type, amount: e.amount, on: fmtDay(e.at), notes: e.notes })),
  };
}

async function buildStaff(ctx) { return buildStaffReport(ctx); }

async function buildAttendance(ctx) {
  const today = localDay();
  const rows = await Attendance.find({ businessId: ctx.businessId, ...branchOf(ctx), date: { $gte: localDay(daysAgo(7)) } }).lean();
  const hours = {};
  for (const r of rows) hours[r.staffName] = money((hours[r.staffName] || 0) + (r.hours || 0));
  return {
    today: rows.filter((r) => r.date === today).map((r) => ({ name: r.staffName, in: r.clockIn, out: r.clockOut || null, stillClockedIn: !r.clockOut })),
    hoursLast7d: Object.entries(hours).map(([name, h]) => ({ name, hours: h })).sort((a, b) => b.hours - a.hours),
    clockedInWithoutOut: rows.filter((r) => !r.clockOut && r.date !== today).length,
  };
}

async function buildActivity(ctx) {
  const mine = await Sale.find({ businessId: ctx.businessId, staffId: ctx.userId, at: { $gte: daysAgo(7) } }).select("total status at").lean();
  const done = mine.filter((s) => s.status === "completed");
  const todayStart = new Date(`${localDay()}T00:00:00`);
  return {
    me: ctx.actorName,
    last7d: { sales: done.length, revenue: money(done.reduce((n, s) => n + s.total, 0)), voids: mine.length - done.length },
    today: { sales: done.filter((s) => s.at >= todayStart).length, revenue: money(done.filter((s) => s.at >= todayStart).reduce((n, s) => n + s.total, 0)) },
  };
}

/**
 * A staff member's start-of-shift view: their own results, what's about to run
 * out, and the trade's signature screens — but only those their role may open.
 * This is also what the assistant uses for anyone without dashboard rights who
 * asks a business-wide question, so they get a useful answer, not a refusal.
 */
async function buildHome(ctx) {
  const [me, inv] = await Promise.all([buildActivity(ctx), buildInventoryReport(ctx)]);
  const typeKey = ctx.business?.typeKey;
  return {
    ...me,
    runningLow: inv.lowStock.slice(0, 6),
    expiringSoon: inv.expiringSoon.slice(0, 4),
    ...(await tradeScreens(ctx, typeKey)),
  };
}

async function tradeScreens(ctx, typeKey) {
  const v = await buildVerticalData(ctx, typeKey);
  return Object.keys(v).length ? { tradeSpecific: v } : {};
}

async function buildSettings(ctx) {
  const b = ctx.business;
  const s = b.settings || {};
  const branches = await Branch.countDocuments({ businessId: ctx.businessId });
  return {
    businessType: typeTemplate(b.typeKey).label, currency: s.currency, vat: s.vatEnabled ? `${s.vatRate}%` : "off",
    branches, modulesOn: s.modules || "all", alerts: s.alerts, loyaltyRule: s.loyaltyRule,
    aiDigestEmail: !!s.ai?.digestEnabled,
    note: "Secrets, keys and PINs are never included.",
  };
}

async function buildAudit(ctx) {
  const rows = await AuditLog.find({ businessId: ctx.businessId, at: { $gte: daysAgo(7) } }).sort({ at: -1 }).limit(300).lean();
  const byAction = {};
  for (const r of rows) byAction[r.action] = (byAction[r.action] || 0) + 1;
  const byActor = {};
  for (const r of rows) byActor[r.actorName] = (byActor[r.actorName] || 0) + 1;
  const sensitive = rows.filter((r) => /void|price|pin|perm|reverse|settings|delete/i.test(r.action));
  return {
    window: "last 7 days", entries: rows.length,
    byAction: Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([action, n]) => ({ action, n })),
    busiestActors: Object.entries(byActor).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n })),
    sensitiveActions: sensitive.slice(0, 10).map((r) => ({ action: r.action, by: r.actorName, target: r.target?.label, at: r.at })),
  };
}

async function buildTickets(ctx) {
  const open = await Ticket.find({ businessId: ctx.businessId, status: { $in: ["open", "in_progress"] }, scope: "business" }).sort({ createdAt: 1 }).lean();
  return {
    open: open.length, high: open.filter((t) => t.priority === "high").length,
    byCategory: open.reduce((a, t) => ((a[t.category] = (a[t.category] || 0) + 1), a), {}),
    oldest: open.slice(0, 8).map((t) => ({ ticketNo: t.ticketNo, subject: t.subject, priority: t.priority, category: t.category, status: t.status, openDays: ageDays(t.createdAt), customer: t.customerName || null })),
  };
}

// ── Trade-specific screens ───────────────────────────────────────────

async function buildKitchen(ctx) {
  const since = daysAgo(1);
  const sales = await Sale.find({ businessId: ctx.businessId, ...branchOf(ctx), status: "completed", at: { $gte: since }, "items.prepStatus": { $exists: true } })
    .select("saleNo at items").lean();
  const counts = { pending: 0, preparing: 0, ready: 0, served: 0 };
  let oldestWaitingMins = 0;
  const waiting = [];
  for (const s of sales) for (const i of s.items) {
    if (!i.prepStatus) continue;
    counts[i.prepStatus] += 1;
    if (i.prepStatus === "pending" || i.prepStatus === "preparing") {
      const mins = Math.round((Date.now() - new Date(s.at).getTime()) / 60000);
      oldestWaitingMins = Math.max(oldestWaitingMins, mins);
      waiting.push({ saleNo: s.saleNo, item: i.name, qty: i.qty, status: i.prepStatus, waitingMins: mins });
    }
  }
  return { window: "last 24h", lines: counts, oldestWaitingMins, longestWaiting: waiting.sort((a, b) => b.waitingMins - a.waitingMins).slice(0, 8) };
}

async function buildProduction(ctx) {
  const runs = await ProductionRun.find({ businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(30) } }).sort({ at: -1 }).lean();
  const by = {};
  for (const r of runs) {
    const e = (by[r.productName] ||= { runs: 0, produced: 0, leakage: 0, credited: 0 });
    e.runs += 1; e.produced += r.producedUnits; e.leakage += r.leakage; e.credited += r.creditedQty;
  }
  const rawUse = {};
  for (const r of runs) for (const c of r.components) rawUse[c.name] = (rawUse[c.name] || 0) + c.qty;
  return {
    window: "last 30 days", runs: runs.length,
    perProduct: Object.entries(by).map(([name, e]) => ({ name, ...e, leakagePct: pct(e.leakage, e.produced + e.leakage) })),
    rawMaterialsUsed: Object.entries(rawUse).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty: Math.round(qty * 100) / 100 })),
    lastRuns: runs.slice(0, 5).map((r) => ({ runNo: r.runNo, product: r.productName, produced: r.producedUnits, leakage: r.leakage, credited: r.creditedQty, on: fmtDay(r.at) })),
  };
}

async function buildSerials(ctx) {
  const rows = await Serial.aggregate([{ $match: { businessId: ctx.businessId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const soon = await Serial.find({ businessId: ctx.businessId, status: "sold", warrantyExpiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * DAY) } })
    .sort({ warrantyExpiresAt: 1 }).limit(8).select("productName serialNo customerName warrantyExpiresAt").lean();
  const inStock = await Serial.aggregate([{ $match: { businessId: ctx.businessId, status: "in_stock" } }, { $group: { _id: "$productName", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]);
  return {
    byStatus: Object.fromEntries(rows.map((r) => [r._id, r.n])),
    inStockByModel: inStock.map((r) => ({ model: r._id, units: r.n })),
    warrantyEndingIn30d: soon.map((s) => ({ product: s.productName, serial: s.serialNo, customer: s.customerName, ends: fmtDay(s.warrantyExpiresAt) })),
  };
}

async function buildVaccinations(ctx) {
  const rows = await VaccinationRecord.find({ businessId: ctx.businessId, ...branchOf(ctx) }).sort({ administeredAt: -1 }).limit(200).lean();
  const latest = new Map();
  for (const r of rows) { const k = `${r.name}|${r.batchLabel}`; if (!latest.has(k)) latest.set(k, r); }
  const now = Date.now();
  const due = [...latest.values()].filter((r) => r.nextDueAt).map((r) => ({
    name: r.name, type: r.type, batch: r.batchLabel, nextDue: fmtDay(r.nextDueAt), daysFromNow: Math.round((new Date(r.nextDueAt).getTime() - now) / DAY),
  })).sort((a, b) => a.daysFromNow - b.daysFromNow);
  return {
    overdue: due.filter((d) => d.daysFromNow < 0), dueWithin14d: due.filter((d) => d.daysFromNow >= 0 && d.daysFromNow <= 14),
    recent: rows.slice(0, 6).map((r) => ({ name: r.name, type: r.type, batch: r.batchLabel, on: fmtDay(r.administeredAt), dosage: r.dosage })),
  };
}

async function buildCohorts(ctx) {
  const cohorts = await Cohort.find({ businessId: ctx.businessId, ...branchOf(ctx) }).sort({ startDate: -1 }).limit(20).lean();
  const shape = (c) => ({
    name: c.name, species: c.species, status: c.status, ageDays: ageDays(c.startDate), started: c.initialCount, alive: c.currentCount,
    mortalityPct: pct(c.mortalityCount, c.initialCount),
    mortalityLast7d: c.events.filter((e) => e.type === "mortality" && new Date(e.at).getTime() > Date.now() - 7 * DAY).reduce((n, e) => n + (e.count || 0), 0),
    harvested: c.events.filter((e) => e.type === "harvest").reduce((n, e) => n + (e.count || 0), 0),
  });
  const feed = await StockMovement.aggregate([
    { $match: { businessId: ctx.businessId, refType: "cohort_feed", at: { $gte: daysAgo(14) } } },
    { $group: { _id: "$refId", qty: { $sum: { $abs: "$qty" } } } },
  ]);
  const feedBy = new Map(feed.map((f) => [String(f._id), f.qty]));
  return {
    active: cohorts.filter((c) => c.status === "active").map((c) => ({ ...shape(c), feedUsedLast14d: Math.round((feedBy.get(String(c._id)) || 0) * 10) / 10 })),
    closedRecently: cohorts.filter((c) => c.status === "closed").slice(0, 4).map(shape),
  };
}

async function buildFrontDesk(ctx) {
  if (!ctx.branchId) return { note: "Select a branch to see rooms." };
  const today = localDay();
  const tomorrow = addDays(today, 1);
  const [rooms, stays] = await Promise.all([
    Room.find({ businessId: ctx.businessId, branchId: ctx.branchId }).lean(),
    staysOverlapping(ctx.businessId, ctx.branchId, today, tomorrow),
  ]);
  const sellable = rooms.filter((r) => r.housekeeping !== "out_of_service").length;
  const arrivals = await staysOverlapping(ctx.businessId, ctx.branchId, today, tomorrow, { checkIn: today, status: "booked" });
  const business = ctx.business;
  const inHouse = stays.filter((s) => s.status === "checked_in").map((s) => shapeStay(s, business));
  const upcoming = await staysOverlapping(ctx.businessId, ctx.branchId, tomorrow, addDays(today, 8));
  const nightsBooked = (d) => upcoming.filter((s) => s.checkIn <= d && s.checkOut > d).length;
  return {
    today, rooms: rooms.length, sellable,
    occupiedTonight: stays.length, occupancyPct: pct(stays.length, sellable), freeTonight: Math.max(0, sellable - stays.length),
    dirty: rooms.filter((r) => r.housekeeping === "dirty").map((r) => r.number),
    outOfService: rooms.filter((r) => r.housekeeping === "out_of_service").map((r) => ({ room: r.number, note: r.note })),
    arrivalsToday: arrivals.map((s) => ({ guest: s.guestName, room: s.roomNumber, nights: s.nights })),
    departuresToday: inHouse.filter((s) => s.checkOut === today).map((s) => ({ guest: s.guestName, room: s.roomNumber, balance: s.balance })),
    inHouseOpenFolios: inHouse.map((s) => ({ folio: s.folioNo, guest: s.guestName, room: s.roomNumber, checkOut: s.checkOut, billSoFar: s.total, paid: s.paid, balance: s.balance })).slice(0, 12),
    unpaidInHouse: money(inHouse.reduce((n, s) => n + Math.max(0, s.balance), 0)),
    next7NightsOccupancy: [1, 2, 3, 4, 5, 6, 7].map((i) => { const d = addDays(today, i); return { night: d, booked: nightsBooked(d), pct: pct(nightsBooked(d), sellable) }; }),
  };
}

async function buildColdRoom(ctx) {
  const showCost = canSeeCost(ctx);
  const [batches, breakdowns, loss, owing] = await Promise.all([
    ColdRoomBatch.find({ businessId: ctx.businessId, ...branchOf(ctx), status: "open" }).lean(),
    ColdRoomBreakdown.find({ businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(30) } }).lean(),
    StockMovement.find({ businessId: ctx.businessId, ...branchOf(ctx), refType: "waste", at: { $gte: daysAgo(30) } }).select("productName qty wasteReason").lean(),
    Customer.find({ businessId: ctx.businessId, creditBalance: { $gt: 0 } }).sort({ creditBalance: -1 }).limit(6).select("name creditBalance").lean(),
  ]);
  const byProduct = new Map();
  for (const b of batches) { const a = byProduct.get(b.productName) || []; a.push(b); byProduct.set(b.productName, a); }
  const stockLines = [...byProduct.entries()].map(([product, list]) => {
    const p = poolsFromBatches(list);
    return {
      product, sealedCartons: p.sealedCartons, looseKg: p.looseKg, loosePieces: p.loosePieces, openBatches: list.length,
      oldestBatchDays: Math.max(...list.map((b) => ageDays(b.purchaseDate))),
      ...(showCost ? { stockValue: p.stockValue, costPerKgRange: [Math.min(...list.map(costPerKgOfBatch)), Math.max(...list.map(costPerKgOfBatch))] } : {}),
    };
  });
  const expected = breakdowns.reduce((n, b) => n + b.expectedYieldKg, 0);
  const variance = breakdowns.reduce((n, b) => n + b.varianceKg, 0);
  const lossByReason = {};
  for (const l of loss) lossByReason[l.wasteReason || "other"] = (lossByReason[l.wasteReason || "other"] || 0) + Math.abs(l.qty);
  return {
    stock: stockLines,
    shrinkage30d: { breakdowns: breakdowns.length, expectedKg: Math.round(expected * 10) / 10, varianceKg: Math.round(variance * 10) / 10, variancePct: pct(variance, expected),
      worst: [...breakdowns].sort((a, b) => a.variancePercent - b.variancePercent).slice(0, 4).map((b) => ({ product: b.productName, variancePct: b.variancePercent, on: fmtDay(b.at) })) },
    lossUnitsByReason: lossByReason,
    creditOwed: owing.map((c) => ({ name: c.name, owes: c.creditBalance })),
    totalCreditOwed: money(owing.reduce((n, c) => n + c.creditBalance, 0)),
  };
}

async function buildMembers(ctx) {
  const now = new Date();
  const [subs, checkIns] = await Promise.all([
    GymSubscription.find({ businessId: ctx.businessId }).lean(),
    GymCheckIn.find({ businessId: ctx.businessId, at: { $gte: daysAgo(7) } }).lean(),
  ]);
  const active = subs.filter((s) => s.status === "active" && s.expiresAt > now);
  const todayStart = new Date(`${localDay()}T00:00:00`);
  const byHour = {};
  for (const c of checkIns.filter((c) => c.allowed)) { const h = new Date(c.at).getHours(); byHour[h] = (byHour[h] || 0) + 1; }
  return {
    activeMembers: active.length, totalEver: subs.length,
    expiringWithin7d: active.filter((s) => s.expiresAt.getTime() - now.getTime() < 7 * DAY).sort((a, b) => a.expiresAt - b.expiresAt).slice(0, 10)
      .map((s) => ({ member: s.customerName, plan: s.planName, expires: fmtDay(s.expiresAt) })),
    lapsedLast30d: subs.filter((s) => s.expiresAt <= now && s.expiresAt > daysAgo(30)).slice(0, 10).map((s) => ({ member: s.customerName, plan: s.planName, expired: fmtDay(s.expiresAt) })),
    planMix: Object.entries(active.reduce((a, s) => ((a[s.planName] = (a[s.planName] || 0) + 1), a), {})).map(([plan, n]) => ({ plan, n })),
    checkIns: { today: checkIns.filter((c) => c.allowed && c.at >= todayStart).length, last7d: checkIns.filter((c) => c.allowed).length, deniedLast7d: checkIns.filter((c) => !c.allowed).length,
      peakHours: Object.entries(byHour).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => ({ hour: `${h}:00`, checkIns: n })) },
  };
}

// ── Service businesses ───────────────────────────────────────────────

async function buildAcademy(ctx) {
  const open = await Intake.find({ businessId: ctx.businessId, status: { $in: ["upcoming", "running"] } }).sort({ startDate: 1 }).limit(12).lean();
  const overview = can(ctx, "dashboard_ops") ? await buildAcademyOverview(ctx) : null;
  if (overview) return overview;
  // Front-desk view: no fee totals, but seat availability is exactly what an
  // admissions person needs ("can I still take someone in this class?"). Say
  // "seatsTaken" and "seatsLeft" outright — a bare "seats" reads as either.
  const taken = await Enrollment.aggregate([
    { $match: { businessId: ctx.businessId, intakeId: { $in: open.map((i) => i._id) }, status: { $ne: "dropped" } } },
    { $group: { _id: "$intakeId", n: { $sum: 1 } } },
  ]);
  const takenBy = new Map(taken.map((t) => [String(t._id), t.n]));
  return {
    openClasses: open.map((i) => {
      const n = takenBy.get(String(i._id)) || 0;
      return { name: i.name, status: i.status, starts: i.startDate, tutor: i.tutor, capacity: i.capacity, seatsTaken: n, seatsLeft: Math.max(0, i.capacity - n) };
    }),
  };
}

async function buildAppointments(ctx) {
  const overview = can(ctx, "dashboard_ops") ? await buildSalonOverview(ctx) : null;
  const start = new Date(`${localDay()}T00:00:00`);
  const rows = await Appointment.find({ businessId: ctx.businessId, ...branchOf(ctx), startsAt: { $gte: start, $lt: new Date(start.getTime() + 2 * DAY) } }).sort({ startsAt: 1 }).limit(40).lean();
  // Free gaps per provider today are what an owner actually wants to fill.
  const byProvider = {};
  for (const a of rows.filter((x) => ["booked", "in_progress", "completed"].includes(x.status) && x.startsAt < new Date(start.getTime() + DAY))) {
    (byProvider[a.provider || "Unassigned"] ||= []).push(a);
  }
  const gaps = [];
  for (const [provider, list] of Object.entries(byProvider)) {
    list.sort((a, b) => a.startsAt - b.startsAt);
    for (let i = 1; i < list.length; i++) {
      const gap = Math.round((list[i].startsAt - list[i - 1].endsAt) / 60000);
      if (gap >= 45) gaps.push({ provider, from: list[i - 1].endsAt, minutes: gap });
    }
  }
  return {
    ...(overview || {}),
    todayAndTomorrow: rows.map((a) => ({ client: a.customerName, services: a.items.map((i) => i.name), provider: a.provider || null, start: a.startsAt, minutes: a.durationMins, status: a.status, total: a.total, depositPaid: a.deposit?.amount || 0 })),
    unfilledGapsToday: gaps.slice(0, 6),
  };
}

async function buildProjects(ctx) {
  const overview = can(ctx, "dashboard_ops") ? await buildAgencyOverview(ctx) : null;
  const live = await Project.find({ businessId: ctx.businessId, status: { $in: ["proposal", "active", "on_hold"] } }).sort({ dueDate: 1 }).limit(15).lean();
  return {
    ...(overview || {}),
    openProjects: live.map((p) => {
      const hours = p.timeLogs.reduce((n, t) => n + t.hours, 0);
      const earned = p.milestones.filter((m) => m.status === "done").reduce((n, m) => n + m.amount, 0);
      return {
        no: p.projectNo, title: p.title, client: p.clientName, type: p.type, status: p.status, budget: p.budget, paid: p.amountPaid,
        deliveredValue: money(earned), milestones: `${p.milestones.filter((m) => m.status === "done").length}/${p.milestones.length}`,
        due: p.dueDate || null, late: !!p.dueDate && p.dueDate < localDay() && p.status !== "proposal", hours: Math.round(hours * 10) / 10,
        paidPerHour: hours > 0 ? money(p.amountPaid / hours) : null,
      };
    }),
  };
}

// ── Registry ─────────────────────────────────────────────────────────

/**
 * key = the route segment under /app/, so the client can send location.pathname
 * as-is. `perms` mirror the page's own gate (any-of). `guide` tells the model
 * what the screen is for and what good advice on it looks like.
 */
export const MODULES = {
  home: { label: "Home", perms: ["activity"], build: buildHome,
    guide: "A staff member's start-of-shift hub. Be encouraging and practical: their own results, what's about to run out, and what needs doing next on this business's own screens. A staff member can sell, file returns, use their trade's front-desk screen and see their own activity — they cannot open stock, purchasing, reports or settings, so tell them to let their manager know about stock problems rather than to fix them." },
  pos: { label: "Point of sale", perms: ["sales"], build: buildPos,
    guide: "The till. Help the cashier sell: what's moving, what's about to run out mid-shift, what's worth suggesting. Keep answers short — they are mid-sale." },
  sales: { label: "Sales history", perms: ["sales", "dashboard_ops"], build: buildSales,
    guide: "Past sales. Look for patterns (peak hours, payment mix), discount and void behaviour that might signal leakage, and how this week compares." },
  products: { label: "Catalog", perms: ["stock"], build: buildProducts,
    guide: "The product catalog. Flag pricing problems (thin or negative margins when cost is visible, missing costs, zero prices), dead or out-of-stock lines and expiry risk." },
  "stock-in": { label: "Stock in", perms: ["stock"], build: buildStockIn,
    guide: "Goods receiving. Help decide what to buy, from whom, and how much, using what's running low and delivery history. Compare suppliers when costs are visible." },
  transfers: { label: "Transfers", perms: ["stock"], build: buildTransfers,
    guide: "Moving stock between branches. Spot imbalances — one branch short while another holds plenty — and unusual movement." },
  returns: { label: "Returns", perms: ["returns", "approve_returns"], build: buildReturns,
    guide: "Customer returns awaiting approval. Surface patterns (a product or reason that keeps recurring) and anything waiting too long. Never approve for them — they decide." },
  jobs: { label: "Job tickets", perms: ["sales", "dashboard_ops"], build: buildJobs,
    guide: "Work in progress. Prioritise by lateness and money: overdue jobs, ready-but-uncollected items (call the customer) and unpaid balances." },
  members: { label: "Members", perms: ["sales", "dashboard_ops"], build: buildMembers,
    guide: "Gym membership. Focus on renewals due, lapsed members worth winning back, plan mix and when the gym is busiest." },
  serials: { label: "Serial numbers", perms: ["stock"], build: buildSerials,
    guide: "Unit-level tracking. Highlight warranties ending soon, units in repair/returned, and models with few units left." },
  production: { label: "Production", perms: ["stock"], build: buildProduction,
    guide: "Turning raw materials into finished goods. Judge yield and LEAKAGE %, raw-material consumption and whether output covers demand." },
  vaccinations: { label: "Vaccination & medication", perms: ["dashboard_ops"], build: buildVaccinations,
    guide: "Flock health schedule. Anything overdue is urgent; list what's due soon in order." },
  suppliers: { label: "Suppliers", perms: ["stock"], build: buildSuppliers,
    guide: "Who the business buys from. Compare reliability and (if costs are visible) spend; point out dormant suppliers and over-dependence on one." },
  "stock-count": { label: "Stock counts", perms: ["stock"], build: buildStockCount,
    guide: "Physical counts vs the system. Explain variances, which items drift most, and whether a count is overdue." },
  cohorts: { label: "Batches", perms: ["stock"], build: buildCohorts,
    guide: "Living batches (flocks). Judge mortality % against age, a sudden recent spike, feed use per bird and which batch is ready to harvest." },
  kitchen: { label: "Kitchen queue", perms: ["sales"], build: buildKitchen,
    guide: "Live kitchen tickets. Call out what has waited longest and what's blocking service. Be brief — the kitchen is busy." },
  "front-desk": { label: "Front desk", perms: ["sales"], build: buildFrontDesk,
    guide: "The hotel's day. Occupancy tonight and over the next week (gaps to sell), arrivals/departures, open folios with money owed, and housekeeping blockers." },
  "cold-room": { label: "Cold room", perms: ["sales"], build: buildColdRoom,
    guide: "Batches in the freezer. Judge shrinkage %, aging batches to sell first (FIFO), cold-chain losses and customers owing on credit." },
  customers: { label: "Customers", perms: ["customers"], build: buildCustomers,
    guide: "The customer base. Identify best customers, dormant ones worth a nudge, repeat rate and anyone owing money." },
  expenses: { label: "Expenses", perms: ["expenses"], build: buildExpenses,
    guide: "Spending. Compare to revenue, find the biggest categories and anything unusual; suggest where to cut only if the numbers support it." },
  staff: { label: "Staff", perms: ["staff_mgmt"], build: buildStaff,
    guide: "Team performance over 30 days — sales, voids, discounts, hours. Be fair and factual; never accuse, point to patterns worth a conversation." },
  attendance: { label: "Attendance", perms: ["dashboard_ops"], build: buildAttendance,
    guide: "Who is in today and hours worked. Flag people still clocked in from earlier days and uneven hours." },
  activity: { label: "My activity", perms: ["activity"], build: buildActivity,
    guide: "A staff member's own performance. Encouraging, specific, short." },
  settings: { label: "Settings", perms: ["settings"], build: buildSettings,
    guide: "Business configuration. Explain what a setting does for THIS type of business and suggest sensible values. Never ask for or reveal secrets." },
  audit: { label: "Audit log", perms: ["audit"], build: buildAudit,
    guide: "What people did in the system. Point out sensitive actions (voids, price changes, reversals, PIN/permission changes) and unusual concentration by one person." },
  tickets: { label: "Support", perms: ["sales"], build: buildTickets,
    guide: "Help-desk tickets. Prioritise by priority and age, and spot recurring complaint themes." },
  academy: { label: "Academy", perms: ["sales", "dashboard_ops"], build: buildAcademy,
    guide: "The school. Cover fee collection (who owes), seat fill per class, attendance, completion and which courses earn most. Suggest concrete next steps: chase named students, add an intake for a full class, promote a class with empty seats." },
  appointments: { label: "Appointments", perms: ["sales", "dashboard_ops"], build: buildAppointments,
    guide: "The salon's schedule. Cover today's bookings, idle gaps per provider, no-show rate (and whether deposits would help), best services and repeat clients." },
  projects: { label: "Projects", perms: ["sales", "dashboard_ops"], build: buildProjects,
    guide: "Client projects. Lead with cash to collect (delivered but unpaid), then overdue milestones, late projects, and projects burning hours relative to what's paid." },
};

/** Which screens carry each trade's signature data into the dashboard / Ask AI snapshot. */
export const TRADE_MODULES = {
  restaurant: ["kitchen", "production"], blinds: ["jobs"], electronics: ["serials", "jobs"], hotel: ["front-desk"],
  water: ["production"], poultry: ["cohorts", "vaccinations"], coldroom: ["cold-room"], laundry: ["jobs"],
  supermarket: ["stock-count"], gym: ["members"], academy: ["academy"], salon: ["appointments"], agency: ["projects"],
};

/**
 * Plain-language steps for each screen, so ANY user can ask "how do I…?" and
 * get an answer that matches this app — not generic advice. The assistant is
 * told to use these only for how-to questions and to say so when something
 * isn't something the app does. Kept short: it rides along with every prompt.
 */
export const HOW_TO = {
  home: "Your hub: your own sales today and this week, what is running low, and shortcuts to your screens in the left menu.",
  pos: "Tap products to add them to the cart (made-to-order items ask for width and height first). Choose cash, POS or transfer — split payments are allowed. Optionally attach a customer or scan their loyalty card, then charge. A receipt can be printed or shared. With no network the sale is saved and sent automatically when you're back online.",
  sales: "Filter by date, staff, customer, product, payment method or receipt number. Open a sale to reprint it or void it (a void needs a reason and the void permission). Service payments (fees, deposits, project payments) are reversed from their own screen, not voided here.",
  products: "Add a product or import a CSV/Excel file; edit price and reorder level; upload a photo; archive what you no longer sell. Cost and margin appear only to roles with finance access.",
  "stock-in": "Pick the product, enter the quantity received and, if you wish, the unit cost and supplier. Stock and the ledger update straight away.",
  transfers: "Choose the products and quantities and the branch they are going to; stock leaves one branch and arrives in the other.",
  returns: "A cashier files a return against a receipt with a reason; a manager approves it (goods go back to stock and the refund is recorded) or rejects it. Custom-made items refund the money but don't restock.",
  jobs: "Create a ticket for work taken in — customer, items or labour, deposit and promised date. Move it received → in progress → ready → collected, and take the balance at pickup.",
  members: "Sell or renew a plan for a member; at the door scan their card to check them in — it shows allowed or expired.",
  serials: "Register units by serial number. When a tracked unit is sold it picks up its warranty dates. Mark units as in repair, returned or written off.",
  production: "Set a finished product's recipe (its raw materials and the yield), then record a run: raw materials are deducted and finished stock is credited after leakage.",
  vaccinations: "Log each vaccination or medication with the batch, dosage and the next due date; overdue items are flagged.",
  suppliers: "Add suppliers with their type and payment terms, then choose one when you record stock in.",
  "stock-count": "Start a count, enter what you physically counted for each product, then close it — any difference posts as a stock adjustment.",
  cohorts: "Start a batch with its starting count, then log feed given, deaths and harvests. A harvest is what turns the animals into sellable stock.",
  kitchen: "Move each order line through pending → preparing → ready → served.",
  "front-desk": "Book a room for dates, check the guest in, post kitchen, bar and laundry charges to their folio, and settle the whole bill once at check-out. Set a room's housekeeping state from its card.",
  "cold-room": "Record a purchase (cartons and cost), open cartons and weigh them out to log shrinkage, sell by kg or piece, take credit sales and repayments, and log cold-chain losses.",
  customers: "Search or add customers; open one to see their spend, visits, credit balance and loyalty card.",
  expenses: "Record each expense with its type and amount; it comes off profit on the dashboard.",
  staff: "Add staff with a role, branch and a 4-digit PIN; reset a PIN, suspend someone, set extra permissions, set shifts or view the org chart.",
  attendance: "Staff clock in and out; managers see the hours worked.",
  activity: "Your own sales and tasks for the day.",
  settings: "Business profile, VAT, receipt footer, alert emails and thresholds, which optional modules are on, the loyalty rule, and branches.",
  audit: "A record of sensitive actions — who voided, changed a price, reset a PIN, or reversed a payment, and when.",
  tickets: "Raise a help-desk ticket, set its priority, assign it, comment, resolve it, or escalate it to StarTrack support.",
  academy: "Courses tab: add courses with fees. Classes tab: schedule a class (course, dates, tutor, seats, fee), open it to enrol students (with an optional first payment), take attendance, and set its status. Students tab: search; open a student to take an instalment, reverse a payment, mark complete, drop, or issue a certificate.",
  appointments: "Schedule tab: New appointment (client, services, stylist, time, optional deposit); then Start, Complete & pay (balance after deposit and discount), Reschedule, No-show or Cancel. Service menu tab: add services with a price and duration.",
  projects: "New project (client, budget). Add milestones that together don't exceed the budget; tick a milestone when delivered; Receive payment when the client pays; Log time to track hours. The Overview shows what to invoice and what is late.",
};

/** Can this caller ask about this module? Mirrors the page's own permission gate. */
export const canUseModule = (ctx, key) => !!MODULES[key] && can(ctx, ...MODULES[key].perms);

/** Builds one module's data, never throwing — the AI should degrade, not 500. */
export async function buildModuleData(ctx, key) {
  try {
    return await MODULES[key].build(ctx);
  } catch (err) {
    console.error(`AI module "${key}" data failed:`, err.message);
    return { error: "Couldn't load this screen's data just now." };
  }
}

/** The trade's signature screens, for the whole-business snapshot. */
export async function buildVerticalData(ctx, typeKey) {
  const keys = (TRADE_MODULES[typeKey] || []).filter((k) => canUseModule(ctx, k));
  const out = {};
  await Promise.all(keys.map(async (k) => { out[k] = await buildModuleData(ctx, k); }));
  return out;
}
