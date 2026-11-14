import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { StockCount } from "#modules/inventory/stockCount.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Return } from "#modules/returns/return.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Job } from "#modules/jobs/job.model.js";
import { Supplier } from "#modules/suppliers/supplier.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { Attendance } from "#modules/staff/attendance.model.js";
import { Ticket } from "#modules/support/ticket.model.js";
import { AuditLog } from "#modules/audit/auditLog.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { canSeeCost } from "#core/middleware/tenant.js";
import { money } from "#core/money.js";
import { typeTemplate } from "#shared/businessTypes.js";
import { allServices, aiFor } from "#platform/registry.js";
import { lazyRecord } from "#platform/lazy.js";
import { buildInventoryReport, buildCustomersReport, buildStaffReport, localDay } from "#modules/metrics/metrics.service.js";

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
  const physical = products.filter((p) => p.archetype !== "made_to_order" && p.archetype !== "service");
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

/**
 * key = the route segment under /app/, so the client can send location.pathname
 * as-is. `perms` mirror the page's own gate (any-of). `guide` tells the model
 * what the screen is for and what good advice on it looks like.
 */
const CORE_MODULES = {
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
  suppliers: { label: "Suppliers", perms: ["stock"], build: buildSuppliers,
    guide: "Who the business buys from. Compare reliability and (if costs are visible) spend; point out dormant suppliers and over-dependence on one." },
  "stock-count": { label: "Stock counts", perms: ["stock"], build: buildStockCount,
    guide: "Physical counts vs the system. Explain variances, which items drift most, and whether a count is overdue." },
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
};

/**
 * Plain-language steps for each screen, so ANY user can ask "how do I…?" and
 * get an answer that matches this app — not generic advice. The assistant is
 * told to use these only for how-to questions and to say so when something
 * isn't something the app does. Kept short: it rides along with every prompt.
 */
const CORE_HOW_TO = {
  home: "Your hub: your own sales today and this week, what is running low, and shortcuts to your screens in the left menu.",
  pos: "Tap products to add them to the cart (made-to-order items ask for width and height first). Choose cash, POS or transfer — split payments are allowed. Optionally attach a customer or scan their loyalty card, then charge. A receipt can be printed or shared. With no network the sale is saved and sent automatically when you're back online.",
  sales: "Filter by date, staff, customer, product, payment method or receipt number. Open a sale to reprint it or void it (a void needs a reason and the void permission). Service payments (fees, deposits, project payments) are reversed from their own screen, not voided here.",
  products: "Add a product or import a CSV/Excel file; edit price and reorder level; upload a photo; archive what you no longer sell. Cost and margin appear only to roles with finance access.",
  "stock-in": "Pick the product, enter the quantity received and, if you wish, the unit cost and supplier. Stock and the ledger update straight away.",
  transfers: "Choose the products and quantities and the branch they are going to; stock leaves one branch and arrives in the other.",
  returns: "A cashier files a return against a receipt with a reason; a manager approves it (goods go back to stock and the refund is recorded) or rejects it. Custom-made items refund the money but don't restock.",
  jobs: "Create a ticket for work taken in — customer, items or labour, deposit and promised date. Move it received → in progress → ready → collected, and take the balance at pickup.",
  suppliers: "Add suppliers with their type and payment terms, then choose one when you record stock in.",
  "stock-count": "Start a count, enter what you physically counted for each product, then close it — any difference posts as a stock adjustment.",
  customers: "Search or add customers; open one to see their spend, visits, credit balance and loyalty card.",
  expenses: "Record each expense with its type and amount; it comes off profit on the dashboard.",
  staff: "Add staff with a role, branch and a 4-digit PIN; reset a PIN, suspend someone, set extra permissions, set shifts or view the org chart.",
  attendance: "Staff clock in and out; managers see the hours worked.",
  activity: "Your own sales and tasks for the day.",
  settings: "Business profile, VAT, receipt footer, alert emails and thresholds, which optional modules are on, the loyalty rule, and branches.",
  audit: "A record of sensitive actions — who voided, changed a price, reset a PIN, or reversed a payment, and when.",
  tickets: "Raise a help-desk ticket, set its priority, assign it, comment, resolve it, or escalate it to StarTrack support.",
};

/**
 * The screens the assistant can talk about: the platform's own, plus the ones
 * each installed business registered for itself (server/businesses/<key>/ai.js).
 * A business's screen carries its `owner`, so only that business can ask about
 * it. Keys are the route segment under /app/, as above.
 */
function mergedTables() {
  const modules = { ...CORE_MODULES };
  const howTo = { ...CORE_HOW_TO };
  for (const svc of allServices()) {
    for (const [key, m] of Object.entries(svc.ai.modules || {})) {
      modules[key] = { ...m, owner: svc.key };
      if (m.howTo) howTo[key] = m.howTo;
    }
  }
  return { modules, howTo };
}
// Built on first use, not at import: see platform/lazy.js.
let tables;
const merged = () => (tables ||= mergedTables());
export const MODULES = lazyRecord(() => merged().modules);
export const HOW_TO = lazyRecord(() => merged().howTo);

/** Can this caller ask about this module? Mirrors the page's own permission gate. */
export const canUseModule = (ctx, key) => {
  const m = MODULES[key];
  return !!m && (!m.owner || m.owner === ctx.business?.typeKey) && can(ctx, ...m.perms);
};

/** Builds one module's data, never throwing — the AI should degrade, not 500. */
export async function buildModuleData(ctx, key) {
  try {
    return await MODULES[key].build(ctx);
  } catch (err) {
    console.error(`AI module "${key}" data failed:`, err.message);
    return { error: "Couldn't load this screen's data just now." };
  }
}

/** The business's signature screens (it names them in its own ai.js), for the whole-business snapshot. */
export async function buildVerticalData(ctx, typeKey) {
  const keys = (aiFor(typeKey).snapshot || []).filter((k) => canUseModule(ctx, k));
  const out = {};
  await Promise.all(keys.map(async (k) => { out[k] = await buildModuleData(ctx, k); }));
  return out;
}
