import { Router } from "express";
import { z } from "zod";
import { Expense } from "#modules/expenses/expense.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { bumpDailyMetric, localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";

export const expensesRouter = Router();

function shape(e) {
  return { id: e._id, type: e.type, amount: e.amount, notes: e.notes, paidBy: e.paidBy, actorName: e.actorName, at: e.at };
}

// GET /api/expenses?from=&to=
expensesRouter.get("/", requirePerm("expenses"), requireBranch, async (req, res) => {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = new Date(`${req.query.from}T00:00:00`);
    if (req.query.to) filter.at.$lt = new Date(new Date(`${req.query.to}T00:00:00`).getTime() + 24 * 3600 * 1000);
  }
  const expenses = await Expense.find(filter).sort({ at: -1 }).limit(200);
  const total = money(expenses.reduce((s, e) => s + e.amount, 0));
  res.json({ expenses: expenses.map(shape), total });
});

const expenseSchema = z.object({
  type: z.string().min(1, "What kind of expense is this?"),
  amount: z.number().positive("Amount must be more than zero"),
  notes: z.string().default(""),
  paidBy: z.string().default(""),
});

// POST /api/expenses
expensesRouter.post("/", requirePerm("expenses"), requireBranch, async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const expense = await Expense.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    type: d.type,
    amount: money(d.amount),
    notes: d.notes,
    paidBy: d.paidBy,
    actorId: req.ctx.userId,
    actorName: req.ctx.actorName,
  });

  await bumpDailyMetric(req.ctx, req.ctx.branchId, localDay(), { expenses: expense.amount });
  res.status(201).json({ expense: shape(expense) });
});

// DELETE /api/expenses/:id — same-day mistakes; audited
expensesRouter.delete("/:id", requirePerm("expenses"), async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!expense) return res.status(404).json({ error: "not_found", message: "Expense not found." });

  await expense.deleteOne();
  await bumpDailyMetric(req.ctx, expense.branchId, localDay(expense.at), { expenses: -expense.amount });
  audit(req.ctx, "expense.delete", { type: "expense", id: expense._id, label: expense.type }, { amount: expense.amount });
  res.json({ ok: true });
});

// GET /api/expenses/types — the business's own vocabulary so far
expensesRouter.get("/types", requirePerm("expenses"), async (req, res) => {
  const types = await Expense.distinct("type", { businessId: req.ctx.businessId });
  res.json({ types: types.sort((a, b) => a.localeCompare(b)) });
});
