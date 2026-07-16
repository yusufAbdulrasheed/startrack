import { Router } from "express";
import { Attendance } from "../models/Attendance.js";
import { requireBranch, requirePerm } from "../middleware/tenant.js";
import { localDay } from "../lib/metrics.js";
import { money } from "../lib/money.js";

export const attendanceRouter = Router();

function shape(a) {
  return {
    id: a._id,
    userId: a.userId,
    staffName: a.staffName,
    date: a.date,
    clockIn: a.clockIn,
    clockOut: a.clockOut || null,
    hours: a.hours,
  };
}

// GET /api/attendance/today — my own state (for the clock widget)
attendanceRouter.get("/today", requireBranch, async (req, res) => {
  const row = await Attendance.findOne({
    businessId: req.ctx.businessId,
    userId: req.ctx.userId,
    date: localDay(),
  }).sort({ clockIn: -1 });
  res.json({ attendance: row ? shape(row) : null });
});

// POST /api/attendance/clock-in
attendanceRouter.post("/clock-in", requireBranch, async (req, res) => {
  const date = localDay();
  const open = await Attendance.findOne({ businessId: req.ctx.businessId, userId: req.ctx.userId, date, clockOut: null });
  if (open) return res.status(409).json({ error: "already_in", message: "You're already clocked in." });

  const row = await Attendance.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    userId: req.ctx.userId,
    staffName: req.ctx.actorName,
    date,
    clockIn: new Date(),
  });
  res.status(201).json({ attendance: shape(row) });
});

// POST /api/attendance/clock-out
attendanceRouter.post("/clock-out", requireBranch, async (req, res) => {
  const row = await Attendance.findOne({
    businessId: req.ctx.businessId,
    userId: req.ctx.userId,
    clockOut: null,
  }).sort({ clockIn: -1 });
  if (!row) return res.status(409).json({ error: "not_in", message: "You're not clocked in." });

  row.clockOut = new Date();
  row.hours = money((row.clockOut - row.clockIn) / 3_600_000);
  await row.save();
  res.json({ attendance: shape(row) });
});

// GET /api/attendance?date=YYYY-MM-DD — the branch view (managers+)
attendanceRouter.get("/", requirePerm("dashboard_ops", "staff_mgmt"), requireBranch, async (req, res) => {
  const date = String(req.query.date || localDay());
  const rows = await Attendance.find({
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    date,
  }).sort({ clockIn: 1 });
  res.json({ date, attendance: rows.map(shape) });
});
