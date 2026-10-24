import { Router } from "express";
import { z } from "zod";
import { Project } from "#modules/businesses/agency/project.model.js";
import { requirePerm, requireBranch, requireCapability } from "#core/middleware/tenant.js";
import { withTransaction } from "#core/tx.js";
import { nextSeq } from "#core/counters.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";
import { HttpError, badRequest, conflict, notFound } from "#core/httpError.js";
import { resolveCustomer, postServicePayment, reverseServicePayment, servicePaymentsSince } from "#modules/services/servicePayment.js";

export const agencyRouter = Router();
agencyRouter.use(requireCapability("projects"));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DATE, "Use a YYYY-MM-DD date");
const optDay = day.or(z.literal(""));
const sendHttp = (res, err) => res.status(err.status).json({ error: err.code, message: err.message });
const idOf = (v) => String(v);
const CLOSED = ["completed", "cancelled"];

// ── Money arithmetic, in one place ───────────────────────────────────

const milestoneTotal = (p) => money(p.milestones.reduce((s, m) => s + m.amount, 0));
const earned = (p) => money(p.milestones.filter((m) => m.status === "done").reduce((s, m) => s + m.amount, 0));

/**
 * What the client should be invoiced for right now: the value of everything
 * delivered so far, less what they've already paid. A finished project is
 * owed in full regardless of how its milestones were carved up.
 */
function dueNow(p) {
  if (p.status === "cancelled") return 0;
  const target = p.status === "completed" ? p.budget : earned(p);
  return money(Math.max(0, target - p.amountPaid));
}

const todayStr = () => localDay();

function shape(p, { full = false } = {}) {
  const hours = money(p.timeLogs.reduce((s, t) => s + t.hours, 0));
  const overdue = p.milestones.filter((m) => m.status === "pending" && m.dueDate && m.dueDate < todayStr()).length;
  const base = {
    id: p._id, projectNo: p.projectNo, customerId: p.customerId, clientName: p.clientName,
    title: p.title, type: p.type, lead: p.lead, status: p.status,
    budget: p.budget, amountPaid: p.amountPaid, outstanding: money(p.budget - p.amountPaid),
    earned: earned(p), dueNow: dueNow(p),
    startDate: p.startDate, dueDate: p.dueDate,
    milestonesDone: p.milestones.filter((m) => m.status === "done").length,
    milestonesTotal: p.milestones.length,
    overdueMilestones: overdue,
    lateProject: !CLOSED.includes(p.status) && !!p.dueDate && p.dueDate < todayStr(),
    hours,
    createdAt: p.createdAt,
  };
  if (!full) return base;
  return {
    ...base,
    description: p.description,
    completedAt: p.completedAt,
    milestoneValue: milestoneTotal(p),
    milestones: p.milestones.map((m) => ({
      id: m._id, title: m.title, amount: m.amount, dueDate: m.dueDate, status: m.status, doneAt: m.doneAt,
      overdue: m.status === "pending" && !!m.dueDate && m.dueDate < todayStr(),
    })),
    payments: p.payments.map((x) => ({
      saleId: x.saleId, saleNo: x.saleNo, amount: x.amount, method: x.method, note: x.note, at: x.at, byName: x.byName, reversed: x.reversed,
    })),
    timeLogs: [...p.timeLogs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50)
      .map((t) => ({ id: t._id, date: t.date, who: t.who, hours: t.hours, note: t.note })),
    effectiveRate: hours > 0 ? money(p.amountPaid / hours) : null,
  };
}

async function load(req) {
  const p = await Project.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!p) throw notFound("Project not found.");
  return p;
}

// ── Projects ─────────────────────────────────────────────────────────

const createSchema = z.object({
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), phone: z.string().default("") }).optional(),
  title: z.string().min(2, "Name the project"),
  type: z.string().default("General"),
  description: z.string().max(2000).default(""),
  lead: z.string().default(""),
  budget: z.number().min(0),
  status: z.enum(["proposal", "active"]).default("proposal"),
  startDate: optDay.default(""),
  dueDate: optDay.default(""),
});

// GET /api/agency/projects?status=&q=&customerId=
agencyRouter.get("/projects", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.status === "open") filter.status = { $in: ["proposal", "active", "on_hold"] };
  else if (["proposal", "active", "on_hold", "completed", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { clientName: rx }, { projectNo: rx }];
  }
  const projects = await Project.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ projects: projects.map((p) => shape(p)) });
});

agencyRouter.post("/projects", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  if (d.startDate && d.dueDate && d.dueDate < d.startDate) return res.status(400).json({ error: "invalid", message: "The deadline is before the start date." });

  try {
    const project = await withTransaction(async (session) => {
      const customer = await resolveCustomer(req.ctx, d, session);
      const seq = await nextSeq(`project:${req.ctx.businessId}`, session);
      const [p] = await Project.create(
        [{
          accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId: req.ctx.branchId,
          projectNo: `P-${String(seq).padStart(4, "0")}`,
          customerId: customer._id, clientName: customer.name,
          title: d.title.trim(), type: d.type.trim() || "General", description: d.description, lead: d.lead.trim(),
          budget: money(d.budget), status: d.status, startDate: d.startDate, dueDate: d.dueDate,
        }],
        { session }
      );
      return p;
    });
    audit(req.ctx, "agency.project.create", { type: "project", id: project._id, label: `${project.projectNo} ${project.title}` }, undefined, { budget: project.budget });
    res.status(201).json({ project: shape(project, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

agencyRouter.get("/projects/:id", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  try {
    res.json({ project: shape(await load(req), { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

const patchSchema = z.object({
  title: z.string().min(2).optional(),
  type: z.string().optional(),
  description: z.string().max(2000).optional(),
  lead: z.string().optional(),
  budget: z.number().min(0).optional(),
  startDate: optDay.optional(),
  dueDate: optDay.optional(),
  status: z.enum(["proposal", "active", "on_hold", "completed", "cancelled"]).optional(),
});

// PATCH /api/agency/projects/:id — details, budget and status changes.
agencyRouter.patch("/projects/:id", requirePerm("sales"), async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const p = await load(req);
    if (CLOSED.includes(p.status) && d.status === undefined) throw conflict(`A ${p.status} project can't be edited — reopen it first.`, "closed");

    if (d.budget !== undefined) {
      const floor = Math.max(p.amountPaid, milestoneTotal(p));
      if (d.budget < floor - 0.01) {
        throw conflict(`The budget can't go below ${floor} — that's already paid or promised across milestones.`, "budget_floor");
      }
    }
    if (d.status && d.status !== p.status) {
      if (d.status === "completed") {
        const open = p.milestones.filter((m) => m.status === "pending").length;
        if (open) throw conflict(`${open} milestone${open === 1 ? " is" : "s are"} not delivered yet — finish them before completing the project.`, "milestones_open");
        p.completedAt = new Date();
      } else if (p.status === "completed") {
        p.completedAt = undefined; // reopened
      }
    }
    const startDate = d.startDate ?? p.startDate;
    const dueDate = d.dueDate ?? p.dueDate;
    if (startDate && dueDate && dueDate < startDate) throw badRequest("The deadline is before the start date.");

    const before = { status: p.status, budget: p.budget };
    Object.assign(p, d);
    await p.save();
    audit(req.ctx, "agency.project.update", { type: "project", id: p._id, label: `${p.projectNo} ${p.title}` }, before, { status: p.status, budget: p.budget });
    res.json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// ── Milestones ───────────────────────────────────────────────────────

const milestoneSchema = z.object({
  title: z.string().min(2, "Name the milestone"),
  amount: z.number().min(0),
  dueDate: optDay.default(""),
});

agencyRouter.post("/projects/:id/milestones", requirePerm("sales"), async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  try {
    const p = await load(req);
    if (CLOSED.includes(p.status)) throw conflict(`A ${p.status} project can't take new milestones.`, "closed");
    const room = money(p.budget - milestoneTotal(p));
    if (parsed.data.amount > room + 0.01) throw conflict(`Only ${room} of the budget is left to assign to milestones.`, "over_budget");
    p.milestones.push({ ...parsed.data, title: parsed.data.title.trim() });
    await p.save();
    res.status(201).json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

const milestonePatch = milestoneSchema.partial().extend({ status: z.enum(["pending", "done"]).optional() });

agencyRouter.patch("/projects/:id/milestones/:mid", requirePerm("sales"), async (req, res) => {
  const parsed = milestonePatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  try {
    const p = await load(req);
    if (p.status === "cancelled") throw conflict("This project was cancelled.", "closed");
    const m = p.milestones.id(req.params.mid);
    if (!m) throw notFound("Milestone not found.");
    const d = parsed.data;

    if (d.amount !== undefined) {
      const room = money(p.budget - (milestoneTotal(p) - m.amount));
      if (d.amount > room + 0.01) throw conflict(`Only ${room} of the budget is left for this milestone.`, "over_budget");
      m.amount = d.amount;
    }
    if (d.title !== undefined) m.title = d.title.trim();
    if (d.dueDate !== undefined) m.dueDate = d.dueDate;
    if (d.status && d.status !== m.status) {
      if (p.status === "completed") throw conflict("Reopen the project before changing its milestones.", "closed");
      m.status = d.status;
      m.doneAt = d.status === "done" ? new Date() : undefined;
      // Delivering work is the moment a proposal becomes a live job.
      if (d.status === "done" && p.status === "proposal") p.status = "active";
    }
    await p.save();
    audit(req.ctx, "agency.milestone", { type: "project", id: p._id, label: `${p.projectNo} · ${m.title}` }, undefined, { status: m.status, amount: m.amount });
    res.json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

agencyRouter.delete("/projects/:id/milestones/:mid", requirePerm("sales"), async (req, res) => {
  try {
    const p = await load(req);
    if (CLOSED.includes(p.status)) throw conflict(`A ${p.status} project can't be changed.`, "closed");
    const m = p.milestones.id(req.params.mid);
    if (!m) throw notFound("Milestone not found.");
    if (m.status === "done") throw conflict("A delivered milestone can't be deleted.", "delivered");
    m.deleteOne();
    await p.save();
    res.json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// ── Payments ─────────────────────────────────────────────────────────

const paySchema = z.object({
  method: z.enum(["cash", "pos", "transfer"]),
  amount: z.number().positive("Enter an amount"),
  note: z.string().max(200).default(""),
});

agencyRouter.post("/projects/:id/payments", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const out = await withTransaction(async (session) => {
      const p = await Project.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!p) throw notFound("Project not found.");
      if (p.status === "cancelled") throw conflict("This project was cancelled — reopen it before taking a payment.", "closed");
      const owed = money(p.budget - p.amountPaid);
      if (owed <= 0) throw conflict("This project is already paid in full.", "paid_up");
      if (d.amount > owed + 0.01) throw badRequest(`The client only owes ${owed}.`, "overpay");

      const customer = await resolveCustomer(req.ctx, { customerId: p.customerId }, session);
      const first = p.payments.every((x) => x.reversed) ;
      const posted = await postServicePayment(req.ctx, {
        kind: "agency", refId: p._id, customer, countVisit: first, session,
        label: `${p.projectNo} ${p.title}${d.note ? ` — ${d.note}` : ""}`,
        payments: [{ method: d.method, amount: d.amount }],
      });
      p.amountPaid = money(p.amountPaid + posted.amount);
      p.payments.push({
        saleId: posted.sale._id, saleNo: posted.sale.saleNo, amount: posted.amount, method: d.method,
        note: d.note, byName: req.ctx.actorName,
      });
      // A deposit on a proposal is the client saying yes.
      if (p.status === "proposal") p.status = "active";
      await p.save({ session });
      return { p, sale: posted.sale };
    });
    audit(req.ctx, "agency.payment", { type: "project", id: out.p._id, label: `${out.p.projectNo} ${out.p.title}` }, undefined, { amount: d.amount, saleNo: out.sale.saleNo });
    res.status(201).json({ project: shape(out.p, { full: true }), saleNo: out.sale.saleNo });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

agencyRouter.post("/projects/:id/payments/:saleId/reverse", requirePerm("void_sales"), async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "invalid", message: "Give a reason for reversing this payment." });
  try {
    const p = await withTransaction(async (session) => {
      const p = await Project.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!p) throw notFound("Project not found.");
      const pay = p.payments.find((x) => idOf(x.saleId) === req.params.saleId);
      if (!pay) throw notFound("That payment isn't on this project.");
      if (pay.reversed) throw conflict("That payment was already reversed.", "already_voided");
      await reverseServicePayment(req.ctx, { saleId: pay.saleId, kind: "agency", reason, session });
      pay.reversed = true;
      pay.reversedReason = reason;
      p.amountPaid = money(Math.max(0, p.amountPaid - pay.amount));
      await p.save({ session });
      return p;
    });
    audit(req.ctx, "agency.payment.reverse", { type: "project", id: p._id, label: `${p.projectNo} ${p.title}` }, undefined, { reason });
    res.json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// ── Time ─────────────────────────────────────────────────────────────

const timeSchema = z.object({
  date: day.optional(),
  who: z.string().default(""),
  hours: z.number().min(0.1).max(24),
  note: z.string().max(300).default(""),
});

agencyRouter.post("/projects/:id/time", requirePerm("sales"), async (req, res) => {
  const parsed = timeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  try {
    const p = await load(req);
    if (CLOSED.includes(p.status)) throw conflict(`A ${p.status} project can't take new hours.`, "closed");
    const date = parsed.data.date || todayStr();
    if (date > todayStr()) throw badRequest("You can't log hours in the future.");
    p.timeLogs.push({ date, who: parsed.data.who.trim() || req.ctx.actorName, hours: parsed.data.hours, note: parsed.data.note });
    await p.save();
    res.status(201).json({ project: shape(p, { full: true }) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// ── Overview: how the agency is going ────────────────────────────────

/** Exported so the AI assistant reads the very same numbers this screen shows. */
export async function buildAgencyOverview(ctx) {
  const { businessId } = ctx;
  const projects = await Project.find({ businessId, status: { $ne: "cancelled" } });
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since30Day = localDay(since30);
  const money30 = await servicePaymentsSince(ctx, "agency", since30);
  const today = todayStr();

  const by = (s) => projects.filter((p) => p.status === s);
  const live = projects.filter((p) => ["active", "on_hold"].includes(p.status));
  const sum = (arr, f) => money(arr.reduce((n, p) => n + f(p), 0));

  const overdueMilestones = [];
  for (const p of live) {
    for (const m of p.milestones) {
      if (m.status === "pending" && m.dueDate && m.dueDate < today) {
        overdueMilestones.push({ projectId: p._id, projectNo: p.projectNo, project: p.title, client: p.clientName, milestone: m.title, amount: m.amount, dueDate: m.dueDate });
      }
    }
  }
  overdueMilestones.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

  const toInvoice = projects
    .map((p) => ({ projectId: p._id, projectNo: p.projectNo, project: p.title, client: p.clientName, amount: dueNow(p) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const hours30 = projects.reduce(
    (n, p) => n + p.timeLogs.filter((t) => t.date >= since30Day).reduce((s, t) => s + t.hours, 0), 0
  );

  return {
    counts: {
      proposal: by("proposal").length, active: by("active").length, onHold: by("on_hold").length, completed: by("completed").length,
      late: live.filter((p) => p.dueDate && p.dueDate < today).length,
    },
    value: {
      pipeline: sum(by("proposal"), (p) => p.budget),
      underway: sum(live, (p) => p.budget),
      collected: sum(projects, (p) => p.amountPaid),
      outstanding: sum(projects.filter((p) => p.status !== "proposal"), (p) => p.budget - p.amountPaid),
      dueNow: sum(projects, dueNow),
      revenue30d: money30.total,
    },
    hours30d: money(hours30),
    toInvoice: toInvoice.slice(0, 8),
    overdueMilestones: overdueMilestones.slice(0, 8),
    byType: Object.values(
      projects.reduce((acc, p) => {
        const row = (acc[p.type] ||= { type: p.type, projects: 0, budget: 0, collected: 0 });
        row.projects += 1; row.budget = money(row.budget + p.budget); row.collected = money(row.collected + p.amountPaid);
        return acc;
      }, {})
    ).sort((a, b) => b.collected - a.collected),
  };
}

agencyRouter.get("/overview", requirePerm("dashboard_ops"), async (req, res) => res.json(await buildAgencyOverview(req.ctx)));
