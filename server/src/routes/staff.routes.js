import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { User } from "../models/User.js";
import { Membership } from "../models/Membership.js";
import { Branch } from "../models/Branch.js";
import { hashPassword, permsForRole } from "../lib/auth.js";
import { requirePerm } from "../middleware/tenant.js";
import { audit } from "../lib/audit.js";

export const staffRouter = Router();

const ASSIGNABLE_ROLES = ["admin", "manager", "staff"];
const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");

function shape(m, user, branch) {
  return {
    id: m._id,
    userId: m.userId,
    name: user?.name || "",
    email: user?.email?.endsWith(".till.local") ? "" : user?.email || "",
    role: m.role,
    branchId: m.branchId || null,
    branchName: branch?.name || "All branches",
    permsOverride: m.permsOverride,
    permissions: permsForRole(m.role, m.permsOverride),
    hasPin: !!m.pinHash,
    status: m.status,
    createdAt: m.createdAt,
  };
}

// GET /api/staff — the team for the active business
staffRouter.get("/", requirePerm("staff_mgmt"), async (req, res) => {
  const memberships = await Membership.find({
    accountId: req.ctx.accountId,
    $or: [{ businessId: req.ctx.businessId }, { businessId: null }],
  }).sort({ createdAt: 1 });
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("name email status");
  const branches = await Branch.find({ businessId: req.ctx.businessId }).select("name");
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const branchById = new Map(branches.map((b) => [String(b._id), b]));
  res.json({
    staff: memberships.map((m) => shape(m, userById.get(String(m.userId)), branchById.get(String(m.branchId)))),
  });
});

const createSchema = z.object({
  name: z.string().min(2, "Enter the staff member's name"),
  role: z.enum(ASSIGNABLE_ROLES),
  branchId: z.string().optional(), // required for manager/staff
  pin: pinSchema,
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6).optional().or(z.literal("")),
  permsOverride: z.array(z.string()).default([]),
});

// POST /api/staff — add a team member (email optional: till-only staff live on PIN)
staffRouter.post("/", requirePerm("staff_mgmt"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  if ((d.role === "manager" || d.role === "staff") && !d.branchId) {
    return res.status(400).json({ error: "invalid", message: "Managers and staff must be assigned to a branch." });
  }
  if (d.branchId) {
    const branch = await Branch.findOne({ _id: d.branchId, businessId: req.ctx.businessId });
    if (!branch) return res.status(400).json({ error: "invalid", message: "That branch doesn't exist." });
  }
  // Only owners may create admins.
  if (d.role === "admin" && !req.ctx.perms.includes("*")) {
    return res.status(403).json({ error: "forbidden", message: "Only the owner can add admins." });
  }

  let email = (d.email || "").toLowerCase().trim();
  if (email) {
    if (await User.findOne({ email })) {
      return res.status(409).json({ error: "email_taken", message: "That email is already registered." });
    }
  } else {
    // Till-only staff: synthesize an internal, never-typed address.
    email = `staff-${crypto.randomBytes(6).toString("hex")}@${req.ctx.businessId}.till.local`;
  }

  const user = await User.create({
    name: d.name,
    email,
    passwordHash: await hashPassword(d.password || crypto.randomBytes(12).toString("hex")),
  });
  const membership = await Membership.create({
    userId: user._id,
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: d.branchId || null,
    role: d.role,
    permsOverride: d.permsOverride,
    pinHash: await hashPassword(d.pin),
  });

  audit(req.ctx, "staff.create", { type: "staff", id: membership._id, label: d.name }, undefined, {
    role: d.role,
    branchId: d.branchId || null,
  });
  const branch = d.branchId ? await Branch.findById(d.branchId) : null;
  res.status(201).json({ staff: shape(membership, user, branch) });
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  branchId: z.string().nullable().optional(),
  permsOverride: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// PATCH /api/staff/:id — role/branch/overrides/suspend
staffRouter.patch("/:id", requirePerm("staff_mgmt"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const membership = await Membership.findOne({ _id: req.params.id, accountId: req.ctx.accountId, businessId: req.ctx.businessId });
  if (!membership) return res.status(404).json({ error: "not_found", message: "Staff member not found." });
  if (membership.role === "owner") {
    return res.status(403).json({ error: "forbidden", message: "The owner can't be edited here." });
  }
  if ((d.role === "admin" || membership.role === "admin") && !req.ctx.perms.includes("*")) {
    return res.status(403).json({ error: "forbidden", message: "Only the owner can manage admins." });
  }
  if (d.branchId) {
    const branch = await Branch.findOne({ _id: d.branchId, businessId: req.ctx.businessId });
    if (!branch) return res.status(400).json({ error: "invalid", message: "That branch doesn't exist." });
  }

  const before = { role: membership.role, branchId: membership.branchId, status: membership.status, permsOverride: membership.permsOverride };
  if (d.role) membership.role = d.role;
  if (d.branchId !== undefined) membership.branchId = d.branchId;
  if (d.permsOverride) membership.permsOverride = d.permsOverride;
  if (d.status) membership.status = d.status;
  await membership.save();

  const user = await User.findById(membership.userId);
  if (d.name && user) {
    user.name = d.name;
    await user.save();
  }

  audit(req.ctx, "staff.update", { type: "staff", id: membership._id, label: user?.name || "" }, before, {
    role: membership.role,
    branchId: membership.branchId,
    status: membership.status,
    permsOverride: membership.permsOverride,
  });
  const branch = membership.branchId ? await Branch.findById(membership.branchId) : null;
  res.json({ staff: shape(membership, user, branch) });
});

// POST /api/staff/:id/pin — reset a till PIN
staffRouter.post("/:id/pin", requirePerm("staff_mgmt"), async (req, res) => {
  const parsed = pinSchema.safeParse(req.body?.pin);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const membership = await Membership.findOne({ _id: req.params.id, accountId: req.ctx.accountId, businessId: req.ctx.businessId });
  if (!membership) return res.status(404).json({ error: "not_found", message: "Staff member not found." });
  if (membership.role === "admin" && !req.ctx.perms.includes("*")) {
    return res.status(403).json({ error: "forbidden", message: "Only the owner can reset an admin's PIN." });
  }

  membership.pinHash = await hashPassword(parsed.data);
  await membership.save();
  const user = await User.findById(membership.userId).select("name");
  audit(req.ctx, "staff.pin_reset", { type: "staff", id: membership._id, label: user?.name || "" });
  res.json({ ok: true });
});
