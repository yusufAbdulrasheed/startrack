import mongoose from "mongoose";
import { Router } from "express";
import { z } from "zod";
import { SalonService } from "#modules/businesses/salon/salonService.model.js";
import { Appointment } from "#modules/businesses/salon/appointment.model.js";
import { requirePerm, requireBranch, requireCapability } from "#core/middleware/tenant.js";
import { withTransaction } from "#core/tx.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";
import { HttpError, badRequest, conflict, notFound } from "#core/httpError.js";
import { resolveCustomer, postServicePayment, cleanPayments, servicePaymentsSince } from "#modules/services/servicePayment.js";
import { escapeRegex } from "#core/regex.js";

export const salonRouter = Router();
salonRouter.use(requireCapability("appointments"));

const sendHttp = (res, err) => res.status(err.status).json({ error: err.code, message: err.message });
const OPEN = ["booked", "in_progress"]; // statuses that actually hold a provider's time

// ── Service menu ─────────────────────────────────────────────────────

const shapeService = (s) => ({
  id: s._id, name: s.name, category: s.category, price: s.price, durationMins: s.durationMins, active: s.active,
});

const serviceSchema = z.object({
  name: z.string().min(2, "Name the service"),
  category: z.string().default("General"),
  price: z.number().min(0),
  durationMins: z.number().int().min(5).max(720),
  active: z.boolean().default(true),
});

salonRouter.get("/services", requirePerm("sales", "dashboard_ops", "prices"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.all !== "1") filter.active = true;
  const services = await SalonService.find(filter).sort({ category: 1, name: 1 });
  res.json({ services: services.map(shapeService) });
});

salonRouter.post("/services", requirePerm("prices"), async (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const dupe = await SalonService.findOne({ businessId: req.ctx.businessId, name: new RegExp(`^${escapeRegex(parsed.data.name)}$`, "i") });
  if (dupe) return res.status(409).json({ error: "duplicate", message: `"${dupe.name}" is already on your menu.` });
  const service = await SalonService.create({ accountId: req.ctx.accountId, businessId: req.ctx.businessId, ...parsed.data });
  audit(req.ctx, "salon.service.create", { type: "salonService", id: service._id, label: service.name });
  res.status(201).json({ service: shapeService(service) });
});

salonRouter.patch("/services/:id", requirePerm("prices"), async (req, res) => {
  const parsed = serviceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const service = await SalonService.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!service) return res.status(404).json({ error: "not_found", message: "Service not found." });
  const before = { price: service.price, active: service.active };
  Object.assign(service, parsed.data);
  await service.save();
  audit(req.ctx, "salon.service.update", { type: "salonService", id: service._id, label: service.name }, before, { price: service.price, active: service.active });
  res.json({ service: shapeService(service) });
});

// ── Appointments ─────────────────────────────────────────────────────

const shapeAppointment = (a) => ({
  id: a._id, customerId: a.customerId, customerName: a.customerName, customerPhone: a.customerPhone,
  items: a.items.map((i) => ({ serviceId: i.serviceId, name: i.name, price: i.price, durationMins: i.durationMins })),
  provider: a.provider, startsAt: a.startsAt, endsAt: a.endsAt, durationMins: a.durationMins,
  total: a.total,
  deposit: a.deposit?.amount ? { amount: a.deposit.amount, method: a.deposit.method, saleNo: a.deposit.saleNo } : null,
  discount: a.discount, amountPaid: a.amountPaid,
  balanceDue: ["booked", "in_progress"].includes(a.status) ? money(Math.max(0, a.total - (a.deposit?.amount || 0))) : 0,
  status: a.status, notes: a.notes, cancelReason: a.cancelReason, completedAt: a.completedAt, bookedByName: a.bookedByName,
});

/** Another open appointment holding this provider at the same time, if any. */
async function findClash(businessId, provider, start, end, ignoreId = null, session = null) {
  if (!provider) return null;
  return Appointment.findOne({
    businessId,
    provider: new RegExp(`^${escapeRegex(provider)}$`, "i"),
    status: { $in: OPEN },
    startsAt: { $lt: end },
    endsAt: { $gt: start },
    ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
  }).session(session);
}

const clashMessage = (c) =>
  `${c.provider} is already booked ${new Date(c.startsAt).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}–${new Date(c.endsAt).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })} with ${c.customerName}.`;

// GET /api/salon/appointments?date=YYYY-MM-DD[&days=1] | ?customerId= | ?status=
salonRouter.get("/appointments", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.ctx.branchId) filter.branchId = req.ctx.branchId;
  if (req.query.customerId) {
    filter.customerId = req.query.customerId;
    delete filter.branchId;
  } else {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || "") ? req.query.date : localDay();
    const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 31);
    const start = new Date(`${date}T00:00:00`);
    filter.startsAt = { $gte: start, $lt: new Date(start.getTime() + days * 86_400_000) };
  }
  if (["booked", "in_progress", "completed", "no_show", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  const rows = await Appointment.find(filter).sort({ startsAt: 1 }).limit(300);
  res.json({ appointments: rows.map(shapeAppointment) });
});

// GET /api/salon/providers — everyone who has ever been booked, for the picker.
salonRouter.get("/providers", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const names = await Appointment.distinct("provider", { businessId: req.ctx.businessId, provider: { $ne: "" } });
  res.json({ providers: names.sort((a, b) => a.localeCompare(b)) });
});

const bookSchema = z.object({
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), phone: z.string().default("") }).optional(),
  serviceIds: z.array(z.string()).min(1, "Pick at least one service"),
  provider: z.string().default(""),
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a date and time"),
  notes: z.string().max(500).default(""),
  deposit: z.object({ method: z.enum(["cash", "pos", "transfer"]), amount: z.number().positive() }).optional(),
});

// POST /api/salon/appointments
salonRouter.post("/appointments", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = bookSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const out = await withTransaction(async (session) => {
      const ids = [...new Set(d.serviceIds)];
      const services = await SalonService.find({ _id: { $in: ids }, businessId: req.ctx.businessId, active: true }).session(session);
      if (services.length !== ids.length) throw badRequest("One of those services is no longer on the menu.");
      // Keep the order the receptionist picked them in.
      const byId = new Map(services.map((s) => [String(s._id), s]));
      const items = ids.map((id) => {
        const s = byId.get(id);
        return { serviceId: s._id, name: s.name, price: s.price, durationMins: s.durationMins };
      });
      const durationMins = items.reduce((n, i) => n + i.durationMins, 0);
      const total = money(items.reduce((n, i) => n + i.price, 0));

      const startsAt = new Date(d.startsAt);
      const endsAt = new Date(startsAt.getTime() + durationMins * 60_000);
      const provider = d.provider.trim();
      const clash = await findClash(req.ctx.businessId, provider, startsAt, endsAt, null, session);
      if (clash) throw conflict(clashMessage(clash), "provider_busy");

      if (d.deposit && d.deposit.amount > total + 0.01) throw badRequest(`A deposit can't be more than the price (${total}).`, "overpay");

      const customer = await resolveCustomer(req.ctx, d, session);
      const _id = new mongoose.Types.ObjectId();
      let deposit = { amount: 0 };
      let sale = null;
      if (d.deposit) {
        const posted = await postServicePayment(req.ctx, {
          kind: "salon", refId: _id, customer, session,
          label: `Booking deposit — ${items.map((i) => i.name).join(", ")}`,
          payments: [d.deposit],
        });
        sale = posted.sale;
        deposit = { amount: posted.amount, method: d.deposit.method, saleId: sale._id, saleNo: sale.saleNo };
      }

      const [appointment] = await Appointment.create(
        [{
          _id, accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId: req.ctx.branchId,
          customerId: customer._id, customerName: customer.name, customerPhone: customer.phone || "",
          items, provider, startsAt, endsAt, durationMins, total, deposit, amountPaid: deposit.amount,
          notes: d.notes, bookedByName: req.ctx.actorName,
        }],
        { session }
      );
      return { appointment, sale };
    });
    audit(req.ctx, "salon.book", { type: "appointment", id: out.appointment._id, label: out.appointment.customerName }, undefined, {
      provider: out.appointment.provider, at: out.appointment.startsAt, total: out.appointment.total,
    });
    res.status(201).json({ appointment: shapeAppointment(out.appointment), depositSaleNo: out.sale?.saleNo || null });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

const reschedSchema = z.object({
  startsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a date and time").optional(),
  provider: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// PATCH /api/salon/appointments/:id — move it, change who does it, edit the note.
salonRouter.patch("/appointments/:id", requirePerm("sales"), async (req, res) => {
  const parsed = reschedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const a = await Appointment.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!a) return res.status(404).json({ error: "not_found", message: "Appointment not found." });
  if (a.status !== "booked") return res.status(409).json({ error: "not_editable", message: `A ${a.status.replace("_", " ")} appointment can't be changed.` });

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : a.startsAt;
  const provider = parsed.data.provider !== undefined ? parsed.data.provider.trim() : a.provider;
  const endsAt = new Date(startsAt.getTime() + a.durationMins * 60_000);
  const clash = await findClash(req.ctx.businessId, provider, startsAt, endsAt, a._id);
  if (clash) return res.status(409).json({ error: "provider_busy", message: clashMessage(clash) });

  a.startsAt = startsAt;
  a.endsAt = endsAt;
  a.provider = provider;
  if (parsed.data.notes !== undefined) a.notes = parsed.data.notes;
  await a.save();
  audit(req.ctx, "salon.reschedule", { type: "appointment", id: a._id, label: a.customerName }, undefined, { at: a.startsAt, provider: a.provider });
  res.json({ appointment: shapeAppointment(a) });
});

const statusSchema = z.object({
  status: z.enum(["in_progress", "no_show", "cancelled"]),
  reason: z.string().max(300).default(""),
});

// POST /api/salon/appointments/:id/status — start, no-show, cancel.
// A deposit already taken is kept: it was revenue the day it arrived, and the
// slot it held can't be resold. (Refund it by hand from History if the owner
// decides to waive it.)
salonRouter.post("/appointments/:id/status", requirePerm("sales"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const a = await Appointment.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!a) return res.status(404).json({ error: "not_found", message: "Appointment not found." });
  const { status, reason } = parsed.data;

  if (status === "in_progress" && a.status !== "booked") return res.status(409).json({ error: "bad_state", message: "Only a booked appointment can be started." });
  if ((status === "no_show" || status === "cancelled") && !OPEN.includes(a.status)) {
    return res.status(409).json({ error: "bad_state", message: `That appointment is already ${a.status.replace("_", " ")}.` });
  }
  if (status === "cancelled" && reason.trim().length < 2) return res.status(400).json({ error: "invalid", message: "Say why it was cancelled." });

  a.status = status;
  if (status === "cancelled") a.cancelReason = reason.trim();
  await a.save();
  audit(req.ctx, `salon.${status}`, { type: "appointment", id: a._id, label: a.customerName }, undefined, reason ? { reason } : undefined);
  res.json({ appointment: shapeAppointment(a) });
});

const completeSchema = z.object({
  discount: z.number().min(0).default(0),
  payments: z.array(z.object({ method: z.enum(["cash", "pos", "transfer"]), amount: z.number().min(0) })).max(3).default([]),
});

// POST /api/salon/appointments/:id/complete — the service is done; take the balance.
salonRouter.post("/appointments/:id/complete", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const out = await withTransaction(async (session) => {
      const a = await Appointment.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!a) throw notFound("Appointment not found.");
      if (!OPEN.includes(a.status)) throw conflict(`That appointment is already ${a.status.replace("_", " ")}.`, "bad_state");

      const discount = money(Math.min(d.discount, a.total));
      const finalTotal = money(a.total - discount);
      const deposit = a.deposit?.amount || 0;
      const due = money(finalTotal - deposit);
      if (due < -0.01) throw badRequest(`A ${discount} discount would leave the ${deposit} deposit more than the bill — reduce the discount.`, "discount_too_big");

      const clean = cleanPayments(d.payments);
      const paid = money(clean.reduce((s, p) => s + p.amount, 0));
      if (Math.abs(paid - Math.max(0, due)) > 0.01) {
        throw badRequest(`Payments (${paid}) don't match the balance due (${Math.max(0, due)}).`, "payment_mismatch");
      }

      const customer = await resolveCustomer(req.ctx, { customerId: a.customerId }, session);
      let sale = null;
      if (due > 0.005) {
        const posted = await postServicePayment(req.ctx, {
          kind: "salon", refId: a._id, customer, countVisit: true, session,
          label: `${a.items.map((i) => i.name).join(", ")}${deposit ? " (balance)" : ""}`,
          payments: clean,
        });
        sale = posted.sale;
      } else {
        // Fully covered by the deposit — no new money, but it's still a visit.
        customer.visits += 1;
        customer.lastSeen = new Date();
        await customer.save({ session });
      }

      a.status = "completed";
      a.discount = discount;
      a.amountPaid = money(deposit + Math.max(0, due));
      a.completedAt = new Date();
      if (sale) { a.balanceSaleId = sale._id; a.balanceSaleNo = sale.saleNo; }
      await a.save({ session });
      return { a, sale };
    });
    audit(req.ctx, "salon.complete", { type: "appointment", id: out.a._id, label: out.a.customerName }, undefined, {
      total: out.a.total, discount: out.a.discount, saleNo: out.sale?.saleNo,
    });
    res.json({ appointment: shapeAppointment(out.a), saleNo: out.sale?.saleNo || null });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// ── Overview: how the salon is going ─────────────────────────────────

/** Exported so the AI assistant reads the very same numbers this screen shows. */
export async function buildSalonOverview(ctx) {
  const { businessId, branchId } = ctx;
  const scope = { businessId, ...(branchId ? { branchId } : {}) };
  const today = localDay();
  const dayStart = new Date(`${today}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const weekEnd = new Date(dayStart.getTime() + 7 * 86_400_000);

  const [todayRows, weekCount, last30, topServices, money30, heldDeposits, repeat] = await Promise.all([
    Appointment.find({ ...scope, startsAt: { $gte: dayStart, $lt: dayEnd } }).sort({ startsAt: 1 }),
    Appointment.countDocuments({ ...scope, status: "booked", startsAt: { $gte: dayStart, $lt: weekEnd } }),
    Appointment.aggregate([
      { $match: { ...scope, startsAt: { $gte: since30, $lt: dayEnd } } },
      { $group: { _id: "$status", n: { $sum: 1 }, value: { $sum: "$total" } } },
    ]),
    Appointment.aggregate([
      { $match: { ...scope, status: "completed", startsAt: { $gte: since30 } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", count: { $sum: 1 }, revenue: { $sum: "$items.price" } } },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]),
    servicePaymentsSince(ctx, "salon", since30),
    Appointment.aggregate([
      { $match: { ...scope, status: "booked", startsAt: { $gte: dayStart } } },
      { $group: { _id: null, held: { $sum: "$deposit.amount" } } },
    ]),
    Appointment.aggregate([
      { $match: { ...scope, status: "completed", startsAt: { $gte: since30 } } },
      { $group: { _id: "$customerId", visits: { $sum: 1 } } },
    ]),
  ]);

  const c = Object.fromEntries(last30.map((r) => [r._id, r]));
  const completed = c.completed?.n || 0;
  const noShows = c.no_show?.n || 0;
  const cancelled = c.cancelled?.n || 0;

  const load = new Map();
  for (const a of todayRows) {
    if (!OPEN.includes(a.status) && a.status !== "completed") continue;
    const key = a.provider || "Unassigned";
    load.set(key, (load.get(key) || 0) + a.durationMins);
  }

  return {
    today: {
      booked: todayRows.filter((a) => a.status === "booked").length,
      inProgress: todayRows.filter((a) => a.status === "in_progress").length,
      completed: todayRows.filter((a) => a.status === "completed").length,
      noShows: todayRows.filter((a) => a.status === "no_show").length,
      expected: money(todayRows.filter((a) => OPEN.includes(a.status)).reduce((s, a) => s + a.total, 0)),
      next: todayRows.filter((a) => a.status === "booked" && a.startsAt > new Date()).slice(0, 5).map(shapeAppointment),
    },
    weekAhead: weekCount,
    last30: {
      completed, noShows, cancelled,
      noShowRate: completed + noShows ? Math.round((noShows / (completed + noShows)) * 100) : null,
      avgTicket: completed ? money((c.completed?.value || 0) / completed) : 0,
      revenue: money30.total,
      repeatClients: repeat.filter((r) => r.visits >= 2).length,
      uniqueClients: repeat.length,
    },
    depositsHeld: money(heldDeposits[0]?.held || 0),
    topServices: topServices.map((s) => ({ name: s._id, count: s.count, revenue: money(s.revenue) })),
    providerLoad: [...load.entries()].map(([provider, mins]) => ({ provider, mins })).sort((a, b) => b.mins - a.mins),
  };
}

salonRouter.get("/overview", requirePerm("dashboard_ops"), async (req, res) => res.json(await buildSalonOverview(req.ctx)));
