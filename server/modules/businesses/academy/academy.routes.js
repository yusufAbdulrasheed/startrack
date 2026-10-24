import { Router } from "express";
import { z } from "zod";
import { Course } from "#modules/businesses/academy/course.model.js";
import { Intake } from "#modules/businesses/academy/intake.model.js";
import { Enrollment } from "#modules/businesses/academy/enrollment.model.js";
import { ClassSession } from "#modules/businesses/academy/classSession.model.js";
import { requirePerm, requireBranch, requireCapability } from "#core/middleware/tenant.js";
import { withTransaction } from "#core/tx.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";
import { HttpError, badRequest, conflict, notFound } from "#core/httpError.js";
import {
  resolveCustomer, postServicePayment, reverseServicePayment, servicePaymentsSince,
} from "#modules/services/servicePayment.js";

export const academyRouter = Router();
academyRouter.use(requireCapability("programs"));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(DATE, "Use a YYYY-MM-DD date");
const sendHttp = (res, err) => res.status(err.status).json({ error: err.code, message: err.message });
const idOf = (v) => String(v);

// ── Shapes ───────────────────────────────────────────────────────────

const shapeCourse = (c) => ({
  id: c._id, name: c.name, category: c.category, level: c.level, mode: c.mode,
  durationWeeks: c.durationWeeks, fee: c.fee, description: c.description, active: c.active,
});

const shapeIntake = (i, stats = {}) => ({
  id: i._id, courseId: i.courseId, courseName: i.courseName, name: i.name,
  startDate: i.startDate, endDate: i.endDate, schedule: i.schedule, tutor: i.tutor, mode: i.mode,
  capacity: i.capacity, fee: i.fee, plannedSessions: i.plannedSessions, status: i.status,
  seatsTaken: stats.seatsTaken ?? 0,
  expected: money(stats.expected ?? 0),
  collected: money(stats.collected ?? 0),
});

const shapeEnrollment = (e, att = null) => ({
  id: e._id, intakeId: e.intakeId, intakeName: e.intakeName, courseId: e.courseId, courseName: e.courseName,
  customerId: e.customerId, studentName: e.studentName, studentPhone: e.studentPhone,
  listFee: e.listFee, discount: e.discount, fee: e.fee, amountPaid: e.amountPaid,
  balance: money(e.fee - e.amountPaid),
  payments: e.payments.map((p) => ({
    saleId: p.saleId, saleNo: p.saleNo, amount: p.amount, method: p.method, at: p.at,
    byName: p.byName, reversed: p.reversed,
  })),
  status: e.status, certificateIssued: e.certificateIssued, note: e.note, enrolledAt: e.enrolledAt,
  ...(att ? { sessionsHeld: att.held, sessionsAttended: att.attended } : {}),
});

/** seats / expected / collected per intake id, counting everyone not dropped. */
async function intakeStats(businessId, intakeIds) {
  const rows = await Enrollment.aggregate([
    { $match: { businessId, intakeId: { $in: intakeIds }, status: { $ne: "dropped" } } },
    { $group: { _id: "$intakeId", seatsTaken: { $sum: 1 }, expected: { $sum: "$fee" }, collected: { $sum: "$amountPaid" } } },
  ]);
  return new Map(rows.map((r) => [idOf(r._id), r]));
}

// ── Courses ──────────────────────────────────────────────────────────

const courseSchema = z.object({
  name: z.string().min(2, "Name the course"),
  category: z.string().default("General"),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  mode: z.enum(["online", "physical", "hybrid"]).default("hybrid"),
  durationWeeks: z.number().min(0).max(260).default(4),
  fee: z.number().min(0),
  description: z.string().default(""),
  active: z.boolean().default(true),
});

academyRouter.get("/courses", requirePerm("sales", "dashboard_ops", "prices"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.all !== "1") filter.active = true;
  const courses = await Course.find(filter).sort({ category: 1, name: 1 });
  res.json({ courses: courses.map(shapeCourse) });
});

academyRouter.post("/courses", requirePerm("prices"), async (req, res) => {
  const parsed = courseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const dupe = await Course.findOne({ businessId: req.ctx.businessId, name: new RegExp(`^${parsed.data.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  if (dupe) return res.status(409).json({ error: "duplicate", message: `"${dupe.name}" is already in your course list.` });
  const course = await Course.create({ accountId: req.ctx.accountId, businessId: req.ctx.businessId, ...parsed.data });
  audit(req.ctx, "academy.course.create", { type: "course", id: course._id, label: course.name });
  res.status(201).json({ course: shapeCourse(course) });
});

academyRouter.patch("/courses/:id", requirePerm("prices"), async (req, res) => {
  const parsed = courseSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const course = await Course.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!course) return res.status(404).json({ error: "not_found", message: "Course not found." });
  const before = { fee: course.fee, active: course.active };
  Object.assign(course, parsed.data);
  await course.save();
  audit(req.ctx, "academy.course.update", { type: "course", id: course._id, label: course.name }, before, { fee: course.fee, active: course.active });
  res.json({ course: shapeCourse(course) });
});

// ── Intakes (scheduled classes) ──────────────────────────────────────

const intakeSchema = z.object({
  courseId: z.string(),
  name: z.string().min(2, "Name this class").optional(),
  startDate: day,
  endDate: day.or(z.literal("")).default(""),
  schedule: z.string().default(""),
  tutor: z.string().default(""),
  mode: z.enum(["online", "physical", "hybrid"]).optional(),
  capacity: z.number().int().min(1).max(5000).default(20),
  fee: z.number().min(0).optional(),
  plannedSessions: z.number().int().min(0).max(1000).default(0),
});

academyRouter.get("/intakes", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (["upcoming", "running", "completed", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.open === "1") filter.status = { $in: ["upcoming", "running"] };
  const intakes = await Intake.find(filter).sort({ startDate: -1 }).limit(200);
  const stats = await intakeStats(req.ctx.businessId, intakes.map((i) => i._id));
  res.json({ intakes: intakes.map((i) => shapeIntake(i, stats.get(idOf(i._id)))) });
});

academyRouter.post("/intakes", requirePerm("prices"), requireBranch, async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  if (d.endDate && d.endDate < d.startDate) return res.status(400).json({ error: "invalid", message: "The end date is before the start date." });
  const course = await Course.findOne({ _id: d.courseId, businessId: req.ctx.businessId });
  if (!course) return res.status(404).json({ error: "not_found", message: "Course not found." });

  const intake = await Intake.create({
    accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId: req.ctx.branchId,
    courseId: course._id, courseName: course.name,
    name: d.name?.trim() || `${course.name} — ${d.startDate}`,
    startDate: d.startDate, endDate: d.endDate, schedule: d.schedule, tutor: d.tutor.trim(),
    mode: d.mode || course.mode, capacity: d.capacity, fee: d.fee ?? course.fee, plannedSessions: d.plannedSessions,
  });
  audit(req.ctx, "academy.intake.create", { type: "intake", id: intake._id, label: intake.name });
  res.status(201).json({ intake: shapeIntake(intake) });
});

academyRouter.patch("/intakes/:id", requirePerm("prices"), async (req, res) => {
  const parsed = intakeSchema
    .omit({ courseId: true })
    .partial()
    .extend({ status: z.enum(["upcoming", "running", "completed", "cancelled"]).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const intake = await Intake.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!intake) return res.status(404).json({ error: "not_found", message: "Class not found." });
  const d = parsed.data;

  if (d.capacity !== undefined) {
    const taken = await Enrollment.countDocuments({ intakeId: intake._id, status: { $ne: "dropped" } });
    if (d.capacity < taken) return res.status(409).json({ error: "capacity", message: `${taken} students are already enrolled — capacity can't go below that.` });
  }
  if (d.status === "cancelled") {
    const live = await Enrollment.countDocuments({ intakeId: intake._id, status: "enrolled" });
    if (live) return res.status(409).json({ error: "has_students", message: `${live} student${live === 1 ? " is" : "s are"} still enrolled — drop or move them before cancelling this class.` });
  }

  const before = { status: intake.status, fee: intake.fee };
  Object.assign(intake, d);
  await intake.save();
  audit(req.ctx, "academy.intake.update", { type: "intake", id: intake._id, label: intake.name }, before, { status: intake.status, fee: intake.fee });
  const stats = await intakeStats(req.ctx.businessId, [intake._id]);
  res.json({ intake: shapeIntake(intake, stats.get(idOf(intake._id))) });
});

// GET /api/academy/intakes/:id — the class page: roster, fees and attendance.
academyRouter.get("/intakes/:id", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const intake = await Intake.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!intake) return res.status(404).json({ error: "not_found", message: "Class not found." });

  const [enrollments, sessions, stats] = await Promise.all([
    Enrollment.find({ intakeId: intake._id }).sort({ studentName: 1 }),
    ClassSession.find({ intakeId: intake._id }).sort({ date: -1 }),
    intakeStats(req.ctx.businessId, [intake._id]),
  ]);

  const att = new Map();
  for (const s of sessions) {
    for (const a of s.attendance) {
      const row = att.get(idOf(a.enrollmentId)) || { held: 0, attended: 0 };
      row.held += 1;
      if (a.present) row.attended += 1;
      att.set(idOf(a.enrollmentId), row);
    }
  }

  res.json({
    intake: shapeIntake(intake, stats.get(idOf(intake._id))),
    enrollments: enrollments.map((e) => shapeEnrollment(e, att.get(idOf(e._id)) || { held: 0, attended: 0 })),
    sessions: sessions.map((s) => ({
      id: s._id, date: s.date, topic: s.topic, tutor: s.tutor, recordedByName: s.recordedByName,
      present: s.attendance.filter((a) => a.present).length, total: s.attendance.length,
      presentIds: s.attendance.filter((a) => a.present).map((a) => a.enrollmentId),
    })),
  });
});

// ── Enrolments & fees ────────────────────────────────────────────────

const enrollSchema = z.object({
  intakeId: z.string(),
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), phone: z.string().default("") }).optional(),
  discount: z.number().min(0).default(0),
  payment: z.object({ method: z.enum(["cash", "pos", "transfer"]), amount: z.number().positive() }).optional(),
});

// POST /api/academy/enrollments — enrol a student, optionally taking the first instalment.
academyRouter.post("/enrollments", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const out = await withTransaction(async (session) => {
      const intake = await Intake.findOne({ _id: d.intakeId, businessId: req.ctx.businessId }).session(session);
      if (!intake) throw notFound("Class not found.");
      if (intake.status === "completed" || intake.status === "cancelled") {
        throw conflict(`This class is ${intake.status} — enrol into an open one.`, "intake_closed");
      }

      const taken = await Enrollment.countDocuments({ intakeId: intake._id, status: { $ne: "dropped" } }).session(session);
      if (taken >= intake.capacity) throw conflict(`This class is full (${intake.capacity} seats).`, "full");

      const customer = await resolveCustomer(req.ctx, d, session);
      const already = await Enrollment.findOne({ intakeId: intake._id, customerId: customer._id, status: { $ne: "dropped" } }).session(session);
      if (already) throw conflict(`${customer.name} is already enrolled in this class.`, "already_enrolled");

      const discount = money(Math.min(d.discount, intake.fee));
      const fee = money(intake.fee - discount);
      if (d.payment && d.payment.amount > fee + 0.01) {
        throw badRequest(`That's more than the fee (${fee}).`, "overpay");
      }

      const [enrollment] = await Enrollment.create(
        [{
          accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId: req.ctx.branchId,
          intakeId: intake._id, intakeName: intake.name, courseId: intake.courseId, courseName: intake.courseName,
          customerId: customer._id, studentName: customer.name, studentPhone: customer.phone || "",
          listFee: intake.fee, discount, fee,
        }],
        { session }
      );

      let sale = null;
      if (d.payment) {
        const posted = await postServicePayment(req.ctx, {
          kind: "academy", refId: enrollment._id, customer, countVisit: true, session,
          label: `${intake.courseName} — tuition`,
          payments: [d.payment],
        });
        sale = posted.sale;
        enrollment.amountPaid = posted.amount;
        enrollment.payments.push({
          saleId: sale._id, saleNo: sale.saleNo, amount: posted.amount, method: d.payment.method,
          byName: req.ctx.actorName,
        });
        await enrollment.save({ session });
      } else {
        customer.visits += 1;
        await customer.save({ session });
      }
      return { enrollment, sale, intake };
    });

    audit(req.ctx, "academy.enroll", { type: "enrollment", id: out.enrollment._id, label: out.enrollment.studentName }, undefined, {
      course: out.enrollment.courseName, class: out.enrollment.intakeName, fee: out.enrollment.fee, paid: out.enrollment.amountPaid,
    });
    res.status(201).json({ enrollment: shapeEnrollment(out.enrollment), saleNo: out.sale?.saleNo || null });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// GET /api/academy/enrollments?intakeId=&status=&owing=1&q=&customerId=
academyRouter.get("/enrollments", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.intakeId) filter.intakeId = req.query.intakeId;
  if (req.query.customerId) filter.customerId = req.query.customerId;
  if (["enrolled", "completed", "dropped"].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.q) filter.studentName = new RegExp(String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (req.query.owing === "1") {
    filter.status = { $in: ["enrolled", "completed"] };
    filter.$expr = { $gt: ["$fee", "$amountPaid"] };
  }
  const rows = await Enrollment.find(filter).sort({ enrolledAt: -1 }).limit(300);
  res.json({ enrollments: rows.map((e) => shapeEnrollment(e)) });
});

const paySchema = z.object({
  method: z.enum(["cash", "pos", "transfer"]),
  amount: z.number().positive("Enter an amount"),
});

// POST /api/academy/enrollments/:id/payments — another instalment.
academyRouter.post("/enrollments/:id/payments", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = paySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  try {
    const out = await withTransaction(async (session) => {
      const enrollment = await Enrollment.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!enrollment) throw notFound("Enrolment not found.");
      if (enrollment.status === "dropped") throw conflict("This student has dropped out — reinstate them before taking a payment.", "dropped");
      const balance = money(enrollment.fee - enrollment.amountPaid);
      if (balance <= 0) throw conflict("This student has already paid in full.", "paid_up");
      if (parsed.data.amount > balance + 0.01) throw badRequest(`They only owe ${balance}.`, "overpay");

      const customer = await resolveCustomer(req.ctx, { customerId: enrollment.customerId }, session);
      const posted = await postServicePayment(req.ctx, {
        kind: "academy", refId: enrollment._id, customer, session,
        label: `${enrollment.courseName} — tuition instalment`,
        payments: [parsed.data],
      });
      enrollment.amountPaid = money(enrollment.amountPaid + posted.amount);
      enrollment.payments.push({
        saleId: posted.sale._id, saleNo: posted.sale.saleNo, amount: posted.amount, method: parsed.data.method,
        byName: req.ctx.actorName,
      });
      await enrollment.save({ session });
      return { enrollment, sale: posted.sale };
    });
    audit(req.ctx, "academy.payment", { type: "enrollment", id: out.enrollment._id, label: out.enrollment.studentName }, undefined, {
      amount: parsed.data.amount, saleNo: out.sale.saleNo,
    });
    res.status(201).json({ enrollment: shapeEnrollment(out.enrollment), saleNo: out.sale.saleNo });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

// POST /api/academy/enrollments/:id/payments/:saleId/reverse — a refund / mistake.
academyRouter.post("/enrollments/:id/payments/:saleId/reverse", requirePerm("void_sales"), async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "invalid", message: "Give a reason for reversing this payment." });

  try {
    const enrollment = await withTransaction(async (session) => {
      const enrollment = await Enrollment.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!enrollment) throw notFound("Enrolment not found.");
      const payment = enrollment.payments.find((p) => idOf(p.saleId) === req.params.saleId);
      if (!payment) throw notFound("That payment isn't on this enrolment.");
      if (payment.reversed) throw conflict("That payment was already reversed.", "already_voided");

      await reverseServicePayment(req.ctx, { saleId: payment.saleId, kind: "academy", reason, session });
      payment.reversed = true;
      payment.reversedReason = reason;
      enrollment.amountPaid = money(Math.max(0, enrollment.amountPaid - payment.amount));
      await enrollment.save({ session });
      return enrollment;
    });
    audit(req.ctx, "academy.payment.reverse", { type: "enrollment", id: enrollment._id, label: enrollment.studentName }, undefined, { reason });
    res.json({ enrollment: shapeEnrollment(enrollment) });
  } catch (err) {
    if (err instanceof HttpError) return sendHttp(res, err);
    throw err;
  }
});

const enrollmentPatch = z.object({
  status: z.enum(["enrolled", "completed", "dropped"]).optional(),
  certificateIssued: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

// PATCH /api/academy/enrollments/:id — complete, drop, reinstate, certificate.
academyRouter.patch("/enrollments/:id", requirePerm("sales"), async (req, res) => {
  const parsed = enrollmentPatch.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const e = await Enrollment.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!e) return res.status(404).json({ error: "not_found", message: "Enrolment not found." });
  const d = parsed.data;

  if (d.status && d.status !== e.status) {
    if (d.status === "enrolled" && e.status === "dropped") {
      // Reinstating takes a seat again — it has to fit.
      const intake = await Intake.findById(e.intakeId);
      const taken = await Enrollment.countDocuments({ intakeId: e.intakeId, status: { $ne: "dropped" } });
      if (intake && taken >= intake.capacity) return res.status(409).json({ error: "full", message: "The class is full — there's no seat to give back." });
    }
    if (d.status === "completed" && e.fee - e.amountPaid > 0.01) {
      return res.status(409).json({ error: "owing", message: `They still owe ${money(e.fee - e.amountPaid)} — settle the fee before marking this course complete.` });
    }
    e.status = d.status;
    e.droppedAt = d.status === "dropped" ? new Date() : undefined;
    if (d.status === "dropped") e.certificateIssued = false;
  }
  if (d.certificateIssued !== undefined) {
    if (d.certificateIssued && e.status !== "completed") {
      return res.status(409).json({ error: "not_complete", message: "Only a student who has completed the course can get a certificate." });
    }
    e.certificateIssued = d.certificateIssued;
  }
  if (d.note !== undefined) e.note = d.note;
  await e.save();
  audit(req.ctx, "academy.enrollment.update", { type: "enrollment", id: e._id, label: e.studentName }, undefined, { status: e.status, certificateIssued: e.certificateIssued });
  res.json({ enrollment: shapeEnrollment(e) });
});

// ── Attendance ───────────────────────────────────────────────────────

const sessionSchema = z.object({
  date: day,
  topic: z.string().max(200).default(""),
  presentIds: z.array(z.string()).default([]),
});

// POST /api/academy/intakes/:id/sessions — record (or correct) a day's class.
academyRouter.post("/intakes/:id/sessions", requirePerm("sales"), async (req, res) => {
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  if (d.date > localDay()) return res.status(400).json({ error: "invalid", message: "You can't record attendance for a future date." });

  const intake = await Intake.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!intake) return res.status(404).json({ error: "not_found", message: "Class not found." });
  if (intake.status === "cancelled") return res.status(409).json({ error: "intake_closed", message: "This class was cancelled." });

  const roster = await Enrollment.find({ intakeId: intake._id, status: { $in: ["enrolled", "completed"] } });
  const rosterIds = new Set(roster.map((e) => idOf(e._id)));
  for (const id of d.presentIds) {
    if (!rosterIds.has(id)) return res.status(400).json({ error: "invalid", message: "Someone ticked isn't on this class's roster." });
  }
  const present = new Set(d.presentIds);

  const session = await ClassSession.findOneAndUpdate(
    { intakeId: intake._id, date: d.date },
    {
      $set: {
        accountId: req.ctx.accountId, businessId: req.ctx.businessId, topic: d.topic, tutor: intake.tutor,
        recordedByName: req.ctx.actorName,
        attendance: roster.map((e) => ({ enrollmentId: e._id, studentName: e.studentName, present: present.has(idOf(e._id)) })),
      },
    },
    { upsert: true, new: true }
  );
  if (intake.status === "upcoming") {
    intake.status = "running";
    await intake.save();
  }
  res.status(201).json({
    session: { id: session._id, date: session.date, topic: session.topic, present: d.presentIds.length, total: roster.length },
  });
});

// ── Overview: how the academy is going ───────────────────────────────

/** Exported so the AI assistant reads the very same numbers this screen shows. */
export async function buildAcademyOverview(ctx) {
  const { businessId } = ctx;
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since7 = new Date(Date.now() - 7 * 86_400_000);
  const since30Day = localDay(since30);

  const [live, statusCounts, money30, byCourseRows, openIntakes, sessions, owingRows, newWeek] = await Promise.all([
    Enrollment.find({ businessId, status: { $in: ["enrolled", "completed"] } }).select("customerId status fee amountPaid"),
    Enrollment.aggregate([{ $match: { businessId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    servicePaymentsSince(ctx, "academy", since30),
    Enrollment.aggregate([
      { $match: { businessId, status: { $ne: "dropped" } } },
      { $group: { _id: "$courseName", students: { $sum: 1 }, billed: { $sum: "$fee" }, collected: { $sum: "$amountPaid" } } },
      { $sort: { collected: -1 } },
      { $limit: 8 },
    ]),
    Intake.find({ businessId, status: { $in: ["upcoming", "running"] } }).sort({ startDate: 1 }).limit(12),
    ClassSession.find({ businessId, date: { $gte: since30Day } }).select("attendance"),
    Enrollment.find({ businessId, status: { $in: ["enrolled", "completed"] }, $expr: { $gt: ["$fee", "$amountPaid"] } })
      .select("studentName studentPhone courseName intakeName fee amountPaid").limit(500),
    Enrollment.countDocuments({ businessId, enrolledAt: { $gte: since7 }, status: { $ne: "dropped" } }),
  ]);

  const billed = money(live.reduce((s, e) => s + e.fee, 0));
  const collected = money(live.reduce((s, e) => s + e.amountPaid, 0));
  const counts = Object.fromEntries(statusCounts.map((r) => [r._id, r.n]));
  const finished = (counts.completed || 0) + (counts.dropped || 0);

  let slots = 0, presentCount = 0;
  for (const s of sessions) for (const a of s.attendance) { slots += 1; if (a.present) presentCount += 1; }

  const stats = await intakeStats(businessId, openIntakes.map((i) => i._id));
  const owing = owingRows
    .map((e) => ({ id: e._id, studentName: e.studentName, phone: e.studentPhone, courseName: e.courseName, intakeName: e.intakeName, balance: money(e.fee - e.amountPaid) }))
    .sort((a, b) => b.balance - a.balance);

  return {
    students: {
      active: new Set(live.filter((e) => e.status === "enrolled").map((e) => idOf(e.customerId))).size,
      enrolments: counts.enrolled || 0,
      completed: counts.completed || 0,
      dropped: counts.dropped || 0,
      newThisWeek: newWeek,
      completionRate: finished ? Math.round(((counts.completed || 0) / finished) * 100) : null,
    },
    fees: {
      billed, collected,
      outstanding: money(billed - collected),
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      revenue30d: money30.total,
      payments30d: money30.count,
      owingCount: owing.length,
      topOwing: owing.slice(0, 8),
    },
    attendance: { rate30d: slots ? Math.round((presentCount / slots) * 100) : null, sessions30d: sessions.length },
    classes: openIntakes.map((i) => {
      const s = stats.get(idOf(i._id));
      const taken = s?.seatsTaken || 0;
      return {
        id: i._id, name: i.name, courseName: i.courseName, status: i.status, startDate: i.startDate, tutor: i.tutor,
        capacity: i.capacity, seatsTaken: taken, fillPct: Math.round((taken / i.capacity) * 100),
      };
    }),
    byCourse: byCourseRows.map((r) => ({ course: r._id, students: r.students, billed: money(r.billed), collected: money(r.collected) })),
  };
}

academyRouter.get("/overview", requirePerm("dashboard_ops"), async (req, res) => res.json(await buildAcademyOverview(req.ctx)));
