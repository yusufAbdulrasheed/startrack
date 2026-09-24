import { Router } from "express";
import { User } from "#modules/auth/user.model.js";
import { Account } from "#modules/auth/account.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Product } from "#modules/products/product.model.js";
import { Ticket } from "#modules/support/ticket.model.js";
import { requireAuth } from "#core/middleware/requireAuth.js";
import { AuditLog } from "#modules/audit/auditLog.model.js";
import { money } from "#core/money.js";
import { typeTemplate } from "#shared/businessTypes.js";

export const platformRouter = Router();

/**
 * The overseer's view sits OUTSIDE the tenant system.
 *
 * Every other route in this app is scoped to one business by tenantContext.
 * These deliberately are not — which is exactly why the gate is its own
 * middleware reading a field that no business-level role can grant. A shop
 * owner is the top of their own tree and can never reach another shop's data,
 * regardless of what permissions they hold inside their own.
 */
async function requirePlatform(req, res, next) {
  const user = await User.findById(req.auth.userId).select("name email platformRole status");
  if (!user || user.status !== "active" || !["overseer", "support"].includes(user.platformRole)) {
    // Deliberately a 404, not a 403: an unauthorised caller should not learn
    // that this surface exists at all.
    return res.status(404).json({ error: "not_found" });
  }
  req.platformUser = user;
  next();
}

// Support can look; only an overseer can change anything.
function requireOverseer(req, res, next) {
  if (req.platformUser.platformRole !== "overseer") {
    return res.status(403).json({ error: "forbidden", message: "That needs full overseer access." });
  }
  next();
}

platformRouter.use(requireAuth, requirePlatform);

const DAY = 86_400_000;

// GET /api/platform/overview — the whole platform on one screen
platformRouter.get("/overview", async (req, res) => {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since7 = new Date(Date.now() - 7 * DAY);

  const [accounts, sandboxes, businesses, users, branches, newAccounts, revenue, byType, byPlan] = await Promise.all([
    Account.countDocuments({ isSandbox: { $ne: true } }),
    Account.countDocuments({ isSandbox: true }),
    Business.countDocuments({}),
    User.countDocuments({ status: "active" }),
    Branch.countDocuments({}),
    Account.countDocuments({ isSandbox: { $ne: true }, createdAt: { $gte: since30 } }),
    Sale.aggregate([
      { $match: { status: "completed", at: { $gte: since30 } } },
      { $group: { _id: null, total: { $sum: "$total" }, txns: { $sum: 1 } } },
    ]),
    Business.aggregate([{ $group: { _id: "$typeKey", n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Account.aggregate([{ $match: { isSandbox: { $ne: true } } }, { $group: { _id: "$plan", n: { $sum: 1 } } }]),
  ]);

  // Which businesses actually traded this week — the number that matters more
  // than sign-ups, because a shop that stopped selling has churned quietly.
  const activeIds = await Sale.distinct("businessId", { at: { $gte: since7 } });

  res.json({
    viewer: { name: req.platformUser.name, platformRole: req.platformUser.platformRole },
    totals: {
      accounts, sandboxes, businesses, users, branches,
      newAccounts30d: newAccounts,
      activeBusinesses7d: activeIds.length,
      revenue30d: money(revenue[0]?.total || 0),
      txns30d: revenue[0]?.txns || 0,
    },
    byType: byType.map((t) => ({ typeKey: t._id, label: typeTemplate(t._id).label, count: t.n })),
    byPlan: Object.fromEntries(byPlan.map((p) => [p._id || "free", p.n])),
  });
});

// GET /api/platform/accounts?q=&page=&includeSandbox=
platformRouter.get("/accounts", async (req, res) => {
  const filter = req.query.includeSandbox === "1" ? {} : { isSandbox: { $ne: true } };
  if (req.query.q) {
    filter.name = { $regex: String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }
  if (req.query.status === "suspended") filter.status = "suspended";

  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);

  const [accounts, count] = await Promise.all([
    Account.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Account.countDocuments(filter),
  ]);
  const ids = accounts.map((a) => a._id);

  const [businesses, owners, sales] = await Promise.all([
    Business.find({ accountId: { $in: ids } }).select("accountId name typeKey").lean(),
    User.find({ _id: { $in: accounts.map((a) => a.ownerUserId) } }).select("name email").lean(),
    Sale.aggregate([
      { $match: { accountId: { $in: ids }, status: "completed" } },
      { $group: { _id: "$accountId", total: { $sum: "$total" }, txns: { $sum: 1 }, last: { $max: "$at" } } },
    ]),
  ]);

  const bizByAccount = new Map();
  for (const b of businesses) {
    if (!bizByAccount.has(String(b.accountId))) bizByAccount.set(String(b.accountId), []);
    bizByAccount.get(String(b.accountId)).push({ id: b._id, name: b.name, typeKey: b.typeKey, typeLabel: typeTemplate(b.typeKey).label });
  }
  const ownerById = new Map(owners.map((o) => [String(o._id), o]));
  const salesByAccount = new Map(sales.map((s) => [String(s._id), s]));

  res.json({
    accounts: accounts.map((a) => {
      const owner = ownerById.get(String(a.ownerUserId));
      const s = salesByAccount.get(String(a._id));
      return {
        id: a._id,
        name: a.name,
        plan: a.plan,
        status: a.status,
        isSandbox: !!a.isSandbox,
        createdAt: a.createdAt,
        owner: owner ? { name: owner.name, email: owner.email } : null,
        businesses: bizByAccount.get(String(a._id)) || [],
        revenue: money(s?.total || 0),
        txns: s?.txns || 0,
        lastSaleAt: s?.last || null,
      };
    }),
    page,
    pages: Math.max(1, Math.ceil(count / limit)),
    total: count,
  });
});

// GET /api/platform/accounts/:id — one tenant in detail (read-only)
platformRouter.get("/accounts/:id", async (req, res) => {
  const account = await Account.findById(req.params.id).lean();
  if (!account) return res.status(404).json({ error: "not_found", message: "Account not found." });

  const [businesses, memberships, products, sales] = await Promise.all([
    Business.find({ accountId: account._id }).lean(),
    Membership.find({ accountId: account._id }).lean(),
    Product.countDocuments({ accountId: account._id, status: "active" }),
    Sale.aggregate([
      { $match: { accountId: account._id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$total" }, txns: { $sum: 1 }, last: { $max: "$at" } } },
    ]),
  ]);
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } })
    .select("name email status createdAt").lean();
  const roleByUser = new Map(memberships.map((m) => [String(m.userId), m.role]));

  res.json({
    account: {
      id: account._id, name: account.name, plan: account.plan, status: account.status,
      isSandbox: !!account.isSandbox, createdAt: account.createdAt,
    },
    businesses: businesses.map((b) => ({
      id: b._id, name: b.name, typeKey: b.typeKey, typeLabel: typeTemplate(b.typeKey).label,
      capabilities: typeTemplate(b.typeKey).capabilities || [],
      currency: b.settings?.currency,
    })),
    // Never the password or PIN hash — the overseer has no business with those.
    people: users.map((u) => ({
      id: u._id, name: u.name, email: u.email, status: u.status,
      role: roleByUser.get(String(u._id)) || "—", joinedAt: u.createdAt,
    })),
    usage: { products, revenue: money(sales[0]?.total || 0), txns: sales[0]?.txns || 0, lastSaleAt: sales[0]?.last || null },
  });
});

// POST /api/platform/accounts/:id/status — suspend or restore a tenant
platformRouter.post("/accounts/:id/status", requireOverseer, async (req, res) => {
  const status = req.body?.status;
  if (!["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "invalid", message: "Status must be active or suspended." });
  }
  const account = await Account.findById(req.params.id);
  if (!account) return res.status(404).json({ error: "not_found", message: "Account not found." });
  if (account.isSandbox) return res.status(400).json({ error: "invalid", message: "Demo sandboxes expire on their own." });

  const before = account.status;
  account.status = status;
  await account.save();

  // Platform actions are logged against the tenant they affected, so the
  // account's own audit trail shows that StarTrack touched it.
  await AuditLog.create({
    accountId: account._id,
    businessId: account._id, // no single business — the action is account-wide
    actorId: req.platformUser._id,
    actorName: `${req.platformUser.name} (StarTrack)`,
    action: "platform.account_status",
    target: { type: "account", id: account._id, label: account.name },
    before: { status: before },
    after: { status, reason: String(req.body?.reason || "") },
  });

  res.json({ account: { id: account._id, name: account.name, status: account.status } });
});

// GET /api/platform/tickets — business tickets escalated to StarTrack support.
// Read-only for now: escalation just hands a StarTrack person visibility;
// working the ticket still happens from inside that business's own queue.
platformRouter.get("/tickets", async (req, res) => {
  const filter = { scope: "platform" };
  if (req.query.status) filter.status = String(req.query.status);

  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [tickets, total] = await Promise.all([
    Ticket.find(filter).sort({ escalatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Ticket.countDocuments(filter),
  ]);
  const businesses = await Business.find({ _id: { $in: tickets.map((t) => t.businessId) } }).select("name").lean();
  const bizById = new Map(businesses.map((b) => [String(b._id), b.name]));

  res.json({
    tickets: tickets.map((t) => ({
      id: t._id, ticketNo: t.ticketNo, subject: t.subject, description: t.description,
      category: t.category, priority: t.priority, status: t.status,
      businessName: bizById.get(String(t.businessId)) || "—",
      raisedBy: t.raisedBy, comments: t.comments, escalatedAt: t.escalatedAt, createdAt: t.createdAt,
    })),
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    total,
  });
});

// GET /api/platform/staff — who at StarTrack has platform access
platformRouter.get("/staff", requireOverseer, async (_req, res) => {
  const staff = await User.find({ platformRole: { $in: ["overseer", "support"] } })
    .select("name email platformRole status createdAt").lean();
  res.json({ staff: staff.map((s) => ({ id: s._id, name: s.name, email: s.email, platformRole: s.platformRole, status: s.status })) });
});

// POST /api/platform/staff — grant or revoke platform access
platformRouter.post("/staff", requireOverseer, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const role = req.body?.platformRole;
  if (!["none", "support", "overseer"].includes(role)) {
    return res.status(400).json({ error: "invalid", message: "Role must be none, support or overseer." });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ error: "not_found", message: "No StarTrack user with that email." });
  if (String(user._id) === String(req.platformUser._id) && role !== "overseer") {
    return res.status(400).json({ error: "invalid", message: "You can't remove your own overseer access." });
  }

  user.platformRole = role;
  await user.save();
  res.json({ user: { id: user._id, name: user.name, email: user.email, platformRole: user.platformRole } });
});
