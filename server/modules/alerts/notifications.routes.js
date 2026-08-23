import { Router } from "express";
import { Notification } from "#modules/alerts/notification.model.js";
import { requirePerm } from "#core/middleware/tenant.js";
import { sweepBusiness } from "#modules/alerts/alerts.service.js";
import { audit } from "#core/audit.js";

export const notificationsRouter = Router();

function shape(n, userId) {
  return {
    id: n._id,
    type: n.type,
    severity: n.severity,
    title: n.title,
    body: n.body,
    target: n.target?.type ? { type: n.target.type, id: n.target.id, label: n.target.label } : null,
    branchId: n.branchId,
    branchName: n.data?.branchName || "",
    data: n.data || {},
    status: n.status,
    read: n.readBy.some((id) => String(id) === String(userId)),
    at: n.lastRaisedAt || n.createdAt,
  };
}

/**
 * What this user is allowed to be told about.
 *
 * Branch-locked roles only ever see their own branch's alerts, and personal
 * notifications (a permission change) belong to their recipient alone — the
 * same rule the rest of the API follows, applied here rather than left to the
 * client to respect.
 */
function visibilityFilter(ctx) {
  const filter = { businessId: ctx.businessId };
  if (ctx.branchLocked && ctx.branchId) {
    filter.$and = [
      { $or: [{ branchId: ctx.branchId }, { branchId: null }] },
      { $or: [{ forUserId: null }, { forUserId: ctx.userId }] },
    ];
  } else {
    filter.$or = [{ forUserId: null }, { forUserId: ctx.userId }];
  }
  return filter;
}

// GET /api/notifications?status=open&limit=50
notificationsRouter.get("/", async (req, res) => {
  const filter = visibilityFilter(req.ctx);
  const status = req.query.status;
  filter.status = status === "all" ? { $in: ["open", "dismissed", "resolved"] } : status || "open";
  if (req.query.type) filter.type = String(req.query.type);

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const [items, unread, open] = await Promise.all([
    Notification.find(filter).sort({ severity: -1, lastRaisedAt: -1 }).limit(limit),
    Notification.countDocuments({ ...visibilityFilter(req.ctx), status: "open", readBy: { $ne: req.ctx.userId } }),
    Notification.countDocuments({ ...visibilityFilter(req.ctx), status: "open" }),
  ]);

  // Worst first, then newest — a critical from this morning outranks an
  // informational one from a minute ago.
  const RANK = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || (new Date(b.lastRaisedAt) - new Date(a.lastRaisedAt)));

  res.json({
    notifications: items.map((n) => shape(n, req.ctx.userId)),
    unread,
    open,
  });
});

// POST /api/notifications/read-all — clears the badge, keeps the list
notificationsRouter.post("/read-all", async (req, res) => {
  await Notification.updateMany(
    { ...visibilityFilter(req.ctx), status: "open", readBy: { $ne: req.ctx.userId } },
    { $addToSet: { readBy: req.ctx.userId } }
  );
  res.json({ ok: true });
});

// POST /api/notifications/:id/dismiss — "I know about this"
notificationsRouter.post("/:id/dismiss", async (req, res) => {
  const n = await Notification.findOne({ _id: req.params.id, ...visibilityFilter(req.ctx) });
  if (!n) return res.status(404).json({ error: "not_found", message: "Notification not found." });
  if (n.status === "open") {
    n.status = "dismissed";
    n.dismissedBy = req.ctx.userId;
    n.dismissedAt = new Date();
    if (!n.readBy.some((id) => String(id) === String(req.ctx.userId))) n.readBy.push(req.ctx.userId);
    await n.save();
  }
  res.json({ notification: shape(n, req.ctx.userId) });
});

// POST /api/notifications/dismiss-all
notificationsRouter.post("/dismiss-all", async (req, res) => {
  const result = await Notification.updateMany(
    { ...visibilityFilter(req.ctx), status: "open" },
    { $set: { status: "dismissed", dismissedBy: req.ctx.userId, dismissedAt: new Date() }, $addToSet: { readBy: req.ctx.userId } }
  );
  res.json({ dismissed: result.modifiedCount });
});

// POST /api/notifications/check — run the sweep for this business now.
// Owners get a "check again" button rather than waiting for the schedule.
notificationsRouter.post("/check", requirePerm("settings"), async (req, res) => {
  const result = await sweepBusiness(req.ctx.business);
  audit(req.ctx, "alerts.check", { type: "alerts", label: req.ctx.business.name }, undefined, {
    raised: result.expiry.raised,
    emailed: result.digest?.sent ? result.digest.count : 0,
  });
  res.json({
    raised: result.expiry.raised,
    pendingReturns: result.pendingReturns,
    email: result.digest?.sent
      ? { sent: true, count: result.digest.count }
      : { sent: false, reason: result.digest?.reason || "unknown" },
  });
});
