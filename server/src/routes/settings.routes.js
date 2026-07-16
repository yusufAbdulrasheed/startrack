import { Router } from "express";
import { z } from "zod";
import { Business } from "../models/Business.js";
import { Branch } from "../models/Branch.js";
import { requirePerm } from "../middleware/tenant.js";
import { audit } from "../lib/audit.js";
import { typeTemplate, TOGGLEABLE_MODULES, ALL_TOGGLEABLE } from "../lib/businessTypes.js";

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
      alertEmail: b.settings.alertEmail,
      // Legacy businesses without the field get everything on.
      modules: b.settings.modules ?? ALL_TOGGLEABLE,
    },
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
  alertEmail: z.string().email().optional().or(z.literal("")),
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
  if (d.alertEmail !== undefined) business.settings.alertEmail = d.alertEmail;
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
