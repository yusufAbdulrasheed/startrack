import { Router } from "express";
import { z } from "zod";
import { Task } from "#modules/tasks/task.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const tasksRouter = Router();

function shape(t) {
  return {
    id: t._id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    assignedToId: t.assignedToId,
    status: t.status,
    createdByName: t.createdByName,
    doneAt: t.doneAt,
    at: t.at,
  };
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

tasksRouter.get("/", requirePerm("activity"), requireBranch, async (req, res) => {
  const status = req.query.status === "done" ? "done" : req.query.status === "all" ? undefined : "open";
  const filter = {
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    $or: [{ assignedToId: null }, { assignedToId: req.ctx.membership._id }],
  };
  if (status) filter.status = status;

  const tasks = await Task.find(filter).sort({ at: -1 }).limit(100);
  tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  res.json({ tasks: tasks.map(shape) });
});

const createSchema = z.object({
  title: z.string().min(1, "Give the task a title"),
  notes: z.string().default(""),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  assignedToId: z.string().nullable().optional(),
});

// POST /api/tasks — hand something to the team or the whole branch.
tasksRouter.post("/", requirePerm("staff_mgmt"), requireBranch, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const task = await Task.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    title: d.title,
    notes: d.notes,
    priority: d.priority,
    assignedToId: d.assignedToId || null,
    createdById: req.ctx.membership._id,
    createdByName: req.ctx.actorName,
  });
  audit(req.ctx, "task.create", { type: "task", id: task._id, label: task.title });
  res.status(201).json({ task: shape(task) });
});

const updateSchema = z.object({
  status: z.enum(["open", "done"]).optional(),
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignedToId: z.string().nullable().optional(),
});


tasksRouter.patch("/:id", requirePerm("activity"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const task = await Task.findOne({ _id: req.params.id, businessId: req.ctx.businessId, branchId: req.ctx.branchId });
  if (!task) return res.status(404).json({ error: "not_found", message: "Task not found." });

  const editingContent = d.title !== undefined || d.notes !== undefined || d.priority !== undefined || d.assignedToId !== undefined;
  if (editingContent && !req.ctx.perms.includes("staff_mgmt") && !req.ctx.perms.includes("*")) {
    return res.status(403).json({ error: "forbidden", message: "You don't have permission to edit this task." });
  }
  const isOwnOrShared = task.assignedToId === null || String(task.assignedToId) === String(req.ctx.membership._id);
  if (d.status && !isOwnOrShared && !req.ctx.perms.includes("staff_mgmt") && !req.ctx.perms.includes("*")) {
    return res.status(403).json({ error: "forbidden", message: "That task isn't assigned to you." });
  }

  if (d.status) {
    task.status = d.status;
    task.doneAt = d.status === "done" ? new Date() : null;
  }
  if (d.title !== undefined) task.title = d.title;
  if (d.notes !== undefined) task.notes = d.notes;
  if (d.priority !== undefined) task.priority = d.priority;
  if (d.assignedToId !== undefined) task.assignedToId = d.assignedToId || null;
  await task.save();

  res.json({ task: shape(task) });
});

// DELETE /api/tasks/:id
tasksRouter.delete("/:id", requirePerm("staff_mgmt"), async (req, res) => {
  const task = await Task.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!task) return res.status(404).json({ error: "not_found", message: "Task not found." });
  await task.deleteOne();
  audit(req.ctx, "task.delete", { type: "task", id: task._id, label: task.title });
  res.json({ ok: true });
});
