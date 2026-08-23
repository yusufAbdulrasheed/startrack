import { Router } from "express";
import { z } from "zod";
import { Business, alertRecipients } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { requirePerm } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";
import { mailEnabled } from "#core/mailer.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { withTransaction } from "#core/tx.js";
import { typeTemplate, TOGGLEABLE_MODULES, ALL_TOGGLEABLE } from "#shared/businessTypes.js";

export const settingsRouter = Router();

function shapeBusiness(b) {
  const template = typeTemplate(b.typeKey);
  return {
    id: b._id,
    name: b.name,
    typeKey: b.typeKey,
    typeLabel: template.label,
    code: b.code,
    settings: {
      currency: b.settings.currency,
      vatEnabled: b.settings.vatEnabled,
      vatRate: b.settings.vatRate,
      receiptFooter: b.settings.receiptFooter,
      // Always presented as a list, whichever field it was stored in.
      alertEmails: alertRecipients(b),
      alerts: {
        lowStock: b.settings.alerts?.lowStock ?? true,
        outOfStock: b.settings.alerts?.outOfStock ?? true,
        expiry: b.settings.alerts?.expiry ?? true,
        pendingReturns: b.settings.alerts?.pendingReturns ?? true,
        expiryDays: b.settings.alerts?.expiryDays?.length ? b.settings.alerts.expiryDays : [30, 14, 7],
        email: b.settings.alerts?.email ?? true,
      },
      // Legacy businesses without the field get everything on.
      modules: b.settings.modules ?? ALL_TOGGLEABLE,
    },
    // So the UI can say "email is off because nobody configured SMTP"
    // rather than leaving the owner to wonder why nothing arrives.
    emailConfigured: mailEnabled(),
  };
}

// GET /api/settings — business profile + branches + available module toggles
settingsRouter.get("/", requirePerm("settings"), async (req, res) => {
  const branches = await Branch.find({ businessId: req.ctx.businessId }).sort({ createdAt: 1 });
  res.json({
    business: shapeBusiness(req.ctx.business),
    branches: branches.map((b) => ({ id: b._id, name: b.name, address: b.address })),
    availableModules: TOGGLEABLE_MODULES,
  });
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  currency: z.string().min(1).max(4).optional(),
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(50).optional(),
  receiptFooter: z.string().max(200).optional(),
  // Up to five people — beyond that it's a mailing list, not an alert.
  alertEmails: z.array(z.string().email("That doesn't look like an email address")).max(5).optional(),
  alerts: z
    .object({
      lowStock: z.boolean().optional(),
      outOfStock: z.boolean().optional(),
      expiry: z.boolean().optional(),
      pendingReturns: z.boolean().optional(),
      expiryDays: z.array(z.number().int().min(1).max(365)).min(1).max(4).optional(),
      email: z.boolean().optional(),
    })
    .optional(),
  modules: z.array(z.enum(ALL_TOGGLEABLE)).optional(),
});

// PATCH /api/settings — audited (VAT changes move money)
settingsRouter.patch("/", requirePerm("settings"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const business = await Business.findById(req.ctx.businessId);
  const before = shapeBusiness(business);
  if (d.name !== undefined) business.name = d.name;
  if (d.currency !== undefined) business.settings.currency = d.currency;
  if (d.vatEnabled !== undefined) business.settings.vatEnabled = d.vatEnabled;
  if (d.vatRate !== undefined) business.settings.vatRate = d.vatRate;
  if (d.receiptFooter !== undefined) business.settings.receiptFooter = d.receiptFooter;
  if (d.alertEmails !== undefined) {
    business.settings.alertEmails = [...new Set(d.alertEmails.map((e) => e.trim().toLowerCase()))];
    business.settings.alertEmail = ""; // the list is the truth from now on
  }
  if (d.alerts !== undefined) {
    // Sorted descending so the nearest threshold is always the most urgent
    // tier, which is what scanExpiry relies on to pick a severity.
    const merged = { ...(business.settings.alerts?.toObject?.() || business.settings.alerts || {}), ...d.alerts };
    if (d.alerts.expiryDays) merged.expiryDays = [...new Set(d.alerts.expiryDays)].sort((a, b) => b - a);
    business.settings.alerts = merged;
  }
  if (d.modules !== undefined) business.settings.modules = d.modules;
  await business.save();

  audit(req.ctx, "settings.update", { type: "settings", id: business._id, label: business.name }, before.settings, shapeBusiness(business).settings);
  res.json({ business: shapeBusiness(business) });
});

const branchSchema = z.object({
  name: z.string().min(1, "Branch name is required"),
  address: z.string().default(""),
});

// POST /api/settings/branches — owner-level growth path
settingsRouter.post("/branches", requirePerm("*"), async (req, res) => {
  const parsed = branchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const branch = await Branch.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    name: parsed.data.name,
    address: parsed.data.address,
  });
  audit(req.ctx, "branch.create", { type: "branch", id: branch._id, label: branch.name });
  res.status(201).json({ branch: { id: branch._id, name: branch.name, address: branch.address } });
});

// PATCH /api/settings/branches/:id
settingsRouter.patch("/branches/:id", requirePerm("*"), async (req, res) => {
  const parsed = branchSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const branch = await Branch.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!branch) return res.status(404).json({ error: "not_found", message: "Branch not found." });
  Object.assign(branch, parsed.data);
  await branch.save();
  res.json({ branch: { id: branch._id, name: branch.name, address: branch.address } });
});

const newBusinessSchema = z.object({
  name: z.string().min(2, "Name the business"),
  businessType: z.string().default("retail"),
  tradingName: z.string().default(""),
  taxId: z.string().default(""),
  currency: z.string().min(1).max(4).default("₦"),
  branchName: z.string().default("Main Branch"),
});

/**
 * POST /api/settings/businesses — a second (or fifth) shop under this account.
 *
 * The account layer stays invisible until exactly this moment. Owning a
 * pharmacy and a bar is one login and two completely separate sets of books —
 * they share nothing but the person paying for them.
 */
settingsRouter.post("/businesses", requirePerm("*"), async (req, res) => {
  const parsed = newBusinessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const dupe = await Business.findOne({ accountId: req.ctx.accountId, name: d.name.trim() });
  if (dupe) return res.status(409).json({ error: "taken", message: "You already have a business with that name." });

  const created = {};
  try {
    await withTransaction(async (session) => {
      [created.business] = await Business.create([{
        accountId: req.ctx.accountId,
        name: d.name.trim(),
        typeKey: d.businessType,
        tradingName: d.tradingName,
        taxId: d.taxId,
        settings: { currency: d.currency, modules: typeTemplate(d.businessType).modules },
      }], { session });

      [created.branch] = await Branch.create([{
        accountId: req.ctx.accountId,
        businessId: created.business._id,
        name: d.branchName || "Main Branch",
      }], { session });

      // The owner is the owner everywhere on their own account.
      await Membership.create([{
        userId: req.ctx.userId,
        accountId: req.ctx.accountId,
        businessId: created.business._id,
        branchId: created.branch._id,
        role: "owner",
      }], { session });
    });
  } catch (err) {
    if (created.branch) await Branch.deleteOne({ _id: created.branch._id }).catch(() => {});
    if (created.business) await Business.deleteOne({ _id: created.business._id }).catch(() => {});
    console.error("add business failed:", err.message);
    return res.status(500).json({ error: "server", message: "Could not create the business. Please try again." });
  }

  audit(req.ctx, "business.create", { type: "business", id: created.business._id, label: created.business.name });
  res.status(201).json({
    business: {
      id: created.business._id,
      name: created.business.name,
      typeKey: created.business.typeKey,
      code: created.business.code,
    },
    branch: { id: created.branch._id, name: created.branch.name },
  });
});

/**
 * GET /api/settings/businesses — every shop on this account, with a pulse.
 * Powers the My Businesses screen.
 */
settingsRouter.get("/businesses", async (req, res) => {
  // Owning the account is what grants the whole list. Anyone else sees only
  // the shops they were actually hired into — a cashier at the supermarket
  // has no business knowing the owner also runs a pharmacy.
  const ownsAccount = req.ctx.perms.includes("*");
  let scope = { accountId: req.ctx.accountId };
  if (!ownsAccount) {
    const mine = await Membership.find({
      userId: req.ctx.userId, accountId: req.ctx.accountId, status: "active",
    }).select("businessId").lean();
    scope._id = { $in: mine.map((m) => m.businessId).filter(Boolean) };
  }
  const businesses = await Business.find(scope).lean();
  const ids = businesses.map((b) => b._id);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

  const [branches, memberships, todaySales] = await Promise.all([
    Branch.find({ accountId: req.ctx.accountId }).select("businessId name").lean(),
    Membership.find({ accountId: req.ctx.accountId, status: "active" }).select("businessId userId").lean(),
    Sale.aggregate([
      { $match: { businessId: { $in: ids }, status: "completed", at: { $gte: startOfDay } } },
      { $group: { _id: "$businessId", revenue: { $sum: "$total" }, txns: { $sum: 1 } } },
    ]),
  ]);

  const branchBy = new Map();
  for (const br of branches) {
    if (!branchBy.has(String(br.businessId))) branchBy.set(String(br.businessId), []);
    branchBy.get(String(br.businessId)).push({ id: br._id, name: br.name });
  }
  const staffBy = new Map();
  for (const m of memberships) {
    if (!m.businessId) continue;
    const k = String(m.businessId);
    staffBy.set(k, (staffBy.get(k) || 0) + 1);
  }
  const salesBy = new Map(todaySales.map((s) => [String(s._id), s]));

  res.json({
    businesses: businesses.map((b) => {
      const t = typeTemplate(b.typeKey);
      const s = salesBy.get(String(b._id));
      return {
        id: b._id,
        name: b.name,
        tradingName: b.tradingName || "",
        typeKey: b.typeKey,
        typeLabel: t.label,
        tagline: t.tagline,
        capabilities: t.capabilities || [],
        code: b.code,
        currency: b.settings?.currency || "₦",
        branches: branchBy.get(String(b._id)) || [],
        staff: staffBy.get(String(b._id)) || 0,
        todayRevenue: s?.revenue || 0,
        todayTxns: s?.txns || 0,
        createdAt: b.createdAt,
      };
    }),
  });
});
