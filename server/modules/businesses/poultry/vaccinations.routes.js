import { Router } from "express";
import { z } from "zod";
import { VaccinationRecord } from "#modules/businesses/poultry/vaccination.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const vaccinationsRouter = Router();

function shape(r) {
  return {
    id: r._id,
    type: r.type,
    name: r.name,
    batchLabel: r.batchLabel,
    dosage: r.dosage,
    administeredAt: r.administeredAt,
    nextDueAt: r.nextDueAt,
    notes: r.notes,
    staffName: r.staffName,
  };
}

// GET /api/vaccinations?type=&from=&to= — the log for the active branch.
vaccinationsRouter.get("/", requirePerm("stock", "dashboard_ops"), requireBranch, async (req, res) => {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  if (req.query.type === "vaccination" || req.query.type === "medication") filter.type = req.query.type;
  if (req.query.from || req.query.to) {
    filter.administeredAt = {};
    if (req.query.from) filter.administeredAt.$gte = new Date(`${req.query.from}T00:00:00`);
    if (req.query.to) filter.administeredAt.$lt = new Date(new Date(`${req.query.to}T00:00:00`).getTime() + 24 * 3600 * 1000);
  }
  const records = await VaccinationRecord.find(filter).sort({ administeredAt: -1 }).limit(200);
  res.json({ records: records.map(shape) });
});

const createSchema = z.object({
  type: z.enum(["vaccination", "medication"]),
  name: z.string().min(1, "Name what was given"),
  batchLabel: z.string().default(""),
  dosage: z.string().default(""),
  administeredAt: z.string().optional(),
  nextDueAt: z.string().nullable().optional(),
  notes: z.string().default(""),
});

// POST /api/vaccinations — no stock, cost or money effect; a pure log.
vaccinationsRouter.post("/", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const record = await VaccinationRecord.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    type: d.type,
    name: d.name,
    batchLabel: d.batchLabel,
    dosage: d.dosage,
    administeredAt: d.administeredAt ? new Date(d.administeredAt) : new Date(),
    nextDueAt: d.nextDueAt ? new Date(d.nextDueAt) : null,
    notes: d.notes,
    staffId: req.ctx.userId,
    staffName: req.ctx.actorName,
  });
  audit(req.ctx, "vaccination.create", { type: "vaccination", id: record._id, label: record.name });
  res.status(201).json({ record: shape(record) });
});

// DELETE /api/vaccinations/:id — same-day mistakes.
vaccinationsRouter.delete("/:id", requirePerm("stock"), async (req, res) => {
  const record = await VaccinationRecord.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!record) return res.status(404).json({ error: "not_found", message: "Record not found." });
  await record.deleteOne();
  audit(req.ctx, "vaccination.delete", { type: "vaccination", id: record._id, label: record.name });
  res.json({ ok: true });
});
