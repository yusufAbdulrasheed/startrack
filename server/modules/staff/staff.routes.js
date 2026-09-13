import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { User } from "#modules/auth/user.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { Shift } from "#modules/staff/shift.model.js";
import { RosterEntry } from "#modules/staff/rosterEntry.model.js";
import { hashPassword, permsForRole } from "#modules/auth/auth.service.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";
import { localDay } from "#modules/metrics/metrics.service.js";

export const staffRouter = Router();

const ASSIGNABLE_ROLES = ["admin", "manager", "staff"];
const pinSchema = z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits");

function shape(m, user, branch, shift, reportsToUser) {
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
    shiftId: m.shiftId || null,
    shiftName: shift ? `${shift.name} (${shift.start}–${shift.end})` : "",
    // Organizational metadata — never consulted by requirePerm/canSeeCost.
    position: m.position || "",
    reportsToId: m.reportsToId || null,
    reportsToName: reportsToUser?.name || "",
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
  const shifts = await Shift.find({ businessId: req.ctx.businessId });
  const membershipById = new Map(memberships.map((m) => [String(m._id), m]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const branchById = new Map(branches.map((b) => [String(b._id), b]));
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  res.json({
    staff: memberships.map((m) => {
      const reportsTo = m.reportsToId && membershipById.get(String(m.reportsToId));
      const reportsToUser = reportsTo && userById.get(String(reportsTo.userId));
      return shape(m, userById.get(String(m.userId)), branchById.get(String(m.branchId)), shiftById.get(String(m.shiftId)), reportsToUser);
    }),
  });
});

// GET /api/staff/org-chart — the same team, shaped as a reporting tree.
// Purely organizational (see Membership.position/reportsToId); the security
// role ladder (owner/admin/manager/staff) is unaffected by this view.
staffRouter.get("/org-chart", requirePerm("staff_mgmt"), async (req, res) => {
  const memberships = await Membership.find({
    accountId: req.ctx.accountId,
    $or: [{ businessId: req.ctx.businessId }, { businessId: null }],
    status: "active",
  });
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }).select("name");
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const nodeById = new Map(
    memberships.map((m) => [
      String(m._id),
      { id: m._id, name: userById.get(String(m.userId))?.name || "", position: m.position || "", role: m.role, children: [] },
    ])
  );
  const roots = [];
  for (const m of memberships) {
    const node = nodeById.get(String(m._id));
    const parent = m.reportsToId && nodeById.get(String(m.reportsToId));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  res.json({ chart: roots });
});

// ── Shifts ───────────────────────────────────────────────────

// GET /api/staff/shifts
staffRouter.get("/shifts", requirePerm("staff_mgmt"), async (req, res) => {
  const shifts = await Shift.find({ businessId: req.ctx.businessId }).sort({ start: 1 });
  res.json({ shifts: shifts.map((s) => ({ id: s._id, name: s.name, start: s.start, end: s.end })) });
});

const shiftSchema = z.object({
  name: z.string().min(1, "Give the shift a name"),
  start: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be HH:MM"),
  end: z.string().regex(/^\d{2}:\d{2}$/, "End time must be HH:MM"),
});

// POST /api/staff/shifts
staffRouter.post("/shifts", requirePerm("staff_mgmt"), async (req, res) => {
  const parsed = shiftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const shift = await Shift.create({ accountId: req.ctx.accountId, businessId: req.ctx.businessId, ...parsed.data });
  audit(req.ctx, "shift.create", { type: "shift", id: shift._id, label: shift.name });
  res.status(201).json({ shift: { id: shift._id, name: shift.name, start: shift.start, end: shift.end } });
});

// DELETE /api/staff/shifts/:id — unassigns anyone on it
staffRouter.delete("/shifts/:id", requirePerm("staff_mgmt"), async (req, res) => {
  const shift = await Shift.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!shift) return res.status(404).json({ error: "not_found", message: "Shift not found." });
  await Membership.updateMany({ businessId: req.ctx.businessId, shiftId: shift._id }, { $set: { shiftId: null } });
  await shift.deleteOne();
  audit(req.ctx, "shift.delete", { type: "shift", id: shift._id, label: shift.name });
  res.json({ ok: true });
});

const createSchema = z.object({
  name: z.string().min(2, "Enter the staff member's name"),
  role: z.enum(ASSIGNABLE_ROLES),
  branchId: z.string().optional(), // required for manager/staff
  pin: pinSchema,
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6).optional().or(z.literal("")),
  permsOverride: z.array(z.string()).default([]),
  position: z.string().max(80).default(""),
  reportsToId: z.string().nullable().optional(),
});

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
  let boss = null;
  if (d.reportsToId) {
    boss = await Membership.findOne({ _id: d.reportsToId, accountId: req.ctx.accountId, businessId: req.ctx.businessId });
    if (!boss) return res.status(400).json({ error: "invalid", message: "That 'reports to' person doesn't exist on this business." });
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
    position: d.position,
    reportsToId: d.reportsToId || null,
  });

  audit(req.ctx, "staff.create", { type: "staff", id: membership._id, label: d.name }, undefined, {
    role: d.role,
    branchId: d.branchId || null,
    position: d.position,
    reportsToId: d.reportsToId || null,
  });
  const branch = d.branchId ? await Branch.findById(d.branchId) : null;
  const reportsToUser = boss ? await User.findById(boss.userId).select("name") : null;
  res.status(201).json({ staff: shape(membership, user, branch, null, reportsToUser) });
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  branchId: z.string().nullable().optional(),
  shiftId: z.string().nullable().optional(),
  permsOverride: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  position: z.string().max(80).optional(),
  reportsToId: z.string().nullable().optional(),
});

// Walks the reportsToId chain from `candidateId` upward; true if it ever
// reaches `membershipId` (which would make that person their own manager,
// directly or transitively). Bounded so a data glitch can't loop forever.
async function wouldCreateReportingCycle(businessId, membershipId, candidateId) {
  let current = candidateId;
  for (let i = 0; i < 20 && current; i++) {
    if (String(current) === String(membershipId)) return true;
    const next = await Membership.findOne({ _id: current, businessId }).select("reportsToId");
    current = next?.reportsToId || null;
  }
  return false;
}

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

  if (d.shiftId) {
    const shift = await Shift.findOne({ _id: d.shiftId, businessId: req.ctx.businessId });
    if (!shift) return res.status(400).json({ error: "invalid", message: "That shift doesn't exist." });
  }

  if (d.reportsToId) {
    const boss = await Membership.findOne({ _id: d.reportsToId, accountId: req.ctx.accountId, businessId: req.ctx.businessId });
    if (!boss) return res.status(400).json({ error: "invalid", message: "That 'reports to' person doesn't exist on this business." });
    if (await wouldCreateReportingCycle(req.ctx.businessId, membership._id, d.reportsToId)) {
      return res.status(400).json({ error: "invalid", message: "That would create a reporting loop." });
    }
  }

  const before = {
    role: membership.role, branchId: membership.branchId, status: membership.status,
    permsOverride: membership.permsOverride, position: membership.position, reportsToId: membership.reportsToId,
  };
  if (d.role) membership.role = d.role;
  if (d.branchId !== undefined) membership.branchId = d.branchId;
  if (d.shiftId !== undefined) membership.shiftId = d.shiftId;
  if (d.permsOverride) membership.permsOverride = d.permsOverride;
  if (d.status) membership.status = d.status;
  if (d.position !== undefined) membership.position = d.position;
  if (d.reportsToId !== undefined) membership.reportsToId = d.reportsToId || null;
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
    position: membership.position,
    reportsToId: membership.reportsToId,
  });
  const branch = membership.branchId ? await Branch.findById(membership.branchId) : null;
  const shift = membership.shiftId ? await Shift.findById(membership.shiftId) : null;
  const reportsTo = membership.reportsToId ? await Membership.findById(membership.reportsToId) : null;
  const reportsToUser = reportsTo ? await User.findById(reportsTo.userId).select("name") : null;
  res.json({ staff: shape(membership, user, branch, shift, reportsToUser) });
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

// ── Roster ───────────────────────────────────────────────────
// A dated assignment of one staff member to one named shift — "my schedule"
// on the staff home screen reads this; Shift itself stays a reusable template.

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

function shapeRoster(r, shift) {
  return {
    id: r._id,
    date: r.date,
    membershipId: r.membershipId,
    shiftId: r.shiftId,
    shiftName: shift?.name || "",
    start: shift?.start || "",
    end: shift?.end || "",
  };
}

// GET /api/staff/roster?from&to — my own upcoming schedule, defaults to the next 7 days.
staffRouter.get("/roster", requirePerm("activity"), requireBranch, async (req, res) => {
  const from = String(req.query.from || localDay());
  const to = String(req.query.to || addDays(from, 7));
  const entries = await RosterEntry.find({
    businessId: req.ctx.businessId,
    membershipId: req.ctx.membership._id,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });
  const shifts = await Shift.find({ businessId: req.ctx.businessId });
  const shiftById = new Map(shifts.map((s) => [String(s._id), s]));
  res.json({ roster: entries.map((r) => shapeRoster(r, shiftById.get(String(r.shiftId)))) });
});

const rosterSchema = z.object({
  membershipId: z.string(),
  shiftId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

// POST /api/staff/roster — assign a staff member to a shift on a date.
staffRouter.post("/roster", requirePerm("staff_mgmt"), requireBranch, async (req, res) => {
  const parsed = rosterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const membership = await Membership.findOne({ _id: d.membershipId, accountId: req.ctx.accountId, businessId: req.ctx.businessId });
  if (!membership) return res.status(400).json({ error: "invalid", message: "That staff member doesn't exist." });
  const shift = await Shift.findOne({ _id: d.shiftId, businessId: req.ctx.businessId });
  if (!shift) return res.status(400).json({ error: "invalid", message: "That shift doesn't exist." });

  const entry = await RosterEntry.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: membership.branchId || req.ctx.branchId,
    membershipId: membership._id,
    shiftId: shift._id,
    date: d.date,
  });
  audit(req.ctx, "roster.assign", { type: "roster", id: entry._id, label: `${shift.name} · ${d.date}` });
  res.status(201).json({ entry: shapeRoster(entry, shift) });
});

// DELETE /api/staff/roster/:id
staffRouter.delete("/roster/:id", requirePerm("staff_mgmt"), async (req, res) => {
  const entry = await RosterEntry.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!entry) return res.status(404).json({ error: "not_found", message: "Roster entry not found." });
  await entry.deleteOne();
  audit(req.ctx, "roster.unassign", { type: "roster", id: entry._id });
  res.json({ ok: true });
});
