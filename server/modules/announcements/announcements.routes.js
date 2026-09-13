import { Router } from "express";
import { z } from "zod";
import { Announcement } from "#modules/announcements/announcement.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const announcementsRouter = Router();

function shape(a) {
  return {
    id: a._id,
    branchId: a.branchId,
    title: a.title,
    body: a.body,
    postedByName: a.postedByName,
    at: a.at,
  };
}

// GET /api/announcements — whole-business posts plus this branch's own.
announcementsRouter.get("/", requirePerm("activity"), requireBranch, async (req, res) => {
  const announcements = await Announcement.find({
    businessId: req.ctx.businessId,
    $or: [{ branchId: null }, { branchId: req.ctx.branchId }],
  })
    .sort({ at: -1 })
    .limit(20);
  res.json({ announcements: announcements.map(shape) });
});

const createSchema = z.object({
  title: z.string().min(1, "Give the announcement a title"),
  body: z.string().default(""),
  branchId: z.string().nullable().optional(),
});

// POST /api/announcements
announcementsRouter.post("/", requirePerm("staff_mgmt"), requireBranch, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const announcement = await Announcement.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: d.branchId || null,
    title: d.title,
    body: d.body,
    postedById: req.ctx.membership._id,
    postedByName: req.ctx.actorName,
  });
  audit(req.ctx, "announcement.create", { type: "announcement", id: announcement._id, label: announcement.title });
  res.status(201).json({ announcement: shape(announcement) });
});

// DELETE /api/announcements/:id
announcementsRouter.delete("/:id", requirePerm("staff_mgmt"), async (req, res) => {
  const announcement = await Announcement.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!announcement) return res.status(404).json({ error: "not_found", message: "Announcement not found." });
  await announcement.deleteOne();
  audit(req.ctx, "announcement.delete", { type: "announcement", id: announcement._id, label: announcement.title });
  res.json({ ok: true });
});
