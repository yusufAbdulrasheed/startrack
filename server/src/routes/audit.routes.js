import { Router } from "express";
import { AuditLog } from "../models/AuditLog.js";
import { requirePerm } from "../middleware/tenant.js";

export const auditRouter = Router();

// GET /api/audit?action=&limit= — the owner's timeline of sensitive actions
auditRouter.get("/", requirePerm("audit"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.action) filter.action = { $regex: `^${String(req.query.action)}` };
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await AuditLog.find(filter).sort({ at: -1 }).limit(limit);
  res.json({
    entries: rows.map((r) => ({
      id: r._id,
      actorName: r.actorName,
      action: r.action,
      target: r.target,
      before: r.before,
      after: r.after,
      at: r.at,
    })),
  });
});
