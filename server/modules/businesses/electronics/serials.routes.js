import { Router } from "express";
import { z } from "zod";
import { Serial } from "#modules/businesses/electronics/serial.model.js";
import { Product } from "#modules/products/product.model.js";
import { Job } from "#modules/jobs/job.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const serialsRouter = Router();

function shape(s) {
  return {
    id: s._id,
    productId: s.productId,
    productName: s.productName,
    serialNo: s.serialNo,
    status: s.status,
    saleId: s.saleId || null,
    customerId: s.customerId || null,
    customerName: s.customerName,
    soldAt: s.soldAt,
    warrantyExpiresAt: s.warrantyExpiresAt || null,
    warrantyActive: !!s.warrantyExpiresAt && new Date(s.warrantyExpiresAt) > new Date(),
    notes: s.notes,
    at: s.at,
  };
}

// GET /api/serials?productId=&status=&q= — search/list. Readable by anyone
// who can sell or manage stock (the POS serial picker needs this too).
serialsRouter.get("/", requirePerm("sales", "stock"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.productId) filter.productId = req.query.productId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.serialNo = { $regex: String(req.query.q).trim(), $options: "i" };
  const serials = await Serial.find(filter).sort({ at: -1 }).limit(200);
  res.json({ serials: serials.map(shape) });
});

const registerSchema = z.object({
  productId: z.string(),
  serialNos: z.array(z.string().min(1)).min(1, "Enter at least one serial number").max(200),
});

// POST /api/serials — register units received into stock. Pair this with
// the matching /api/inventory/stock-in call for the same quantity; this
// route doesn't move stock itself, it just gives each unit an identity.
serialsRouter.post("/", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { productId, serialNos } = parsed.data;

  const product = await Product.findOne({ _id: productId, businessId: req.ctx.businessId, status: "active" });
  if (!product) return res.status(400).json({ error: "invalid", message: "That product doesn't exist." });
  if (!product.tracksSerials) {
    return res.status(400).json({ error: "invalid", message: `${product.name} isn't set up to track serial numbers.` });
  }

  const cleaned = [...new Set(serialNos.map((s) => s.trim()).filter(Boolean))];
  if (cleaned.length !== serialNos.length) {
    return res.status(400).json({ error: "invalid", message: "Serial numbers must be unique and non-empty." });
  }
  const existing = await Serial.findOne({ businessId: req.ctx.businessId, serialNo: { $in: cleaned } });
  if (existing) {
    return res.status(409).json({ error: "serial_taken", message: `${existing.serialNo} is already registered.` });
  }

  const rows = await Serial.insertMany(
    cleaned.map((serialNo) => ({
      accountId: req.ctx.accountId,
      businessId: req.ctx.businessId,
      branchId: req.ctx.branchId,
      productId: product._id,
      productName: product.name,
      serialNo,
      status: "in_stock",
    }))
  );
  audit(req.ctx, "serial.register", { type: "product", id: product._id, label: product.name }, undefined, { count: rows.length });
  res.status(201).json({ serials: rows.map(shape) });
});

const updateSchema = z.object({
  status: z.enum(["in_stock", "sold", "returned", "repair", "warranty_void", "written_off"]).optional(),
  notes: z.string().optional(),
});

// PATCH /api/serials/:id — correct status/notes (mark under repair, void a
// warranty, write one off). Selling/returning through POS or Returns is what
// normally moves status; this is for the exceptions.
serialsRouter.patch("/:id", requirePerm("stock"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const serial = await Serial.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!serial) return res.status(404).json({ error: "not_found", message: "Serial not found." });

  const before = { status: serial.status, notes: serial.notes };
  if (d.status) serial.status = d.status;
  if (d.notes !== undefined) serial.notes = d.notes;
  await serial.save();
  audit(req.ctx, "serial.update", { type: "serial", id: serial._id, label: serial.serialNo }, before, { status: serial.status, notes: serial.notes });
  res.json({ serial: shape(serial) });
});

// GET /api/serials/:serialNo/lookup — the "warranty and repair history" view:
// current status plus every job ticket ever opened against this unit.
// A dedicated path segment (not GET /:id) because this looks up by the
// human-typed serial number, not a Mongo id.
serialsRouter.get("/:serialNo/lookup", requirePerm("sales", "stock"), async (req, res) => {
  const serial = await Serial.findOne({ businessId: req.ctx.businessId, serialNo: req.params.serialNo });
  if (!serial) return res.status(404).json({ error: "not_found", message: "No unit with that serial number." });
  const jobs = await Job.find({ businessId: req.ctx.businessId, serialNo: req.params.serialNo })
    .sort({ createdAt: -1 })
    .select("jobNo title stage total receivedAt collectedAt");
  res.json({
    serial: shape(serial),
    jobs: jobs.map((j) => ({
      id: j._id, jobNo: j.jobNo, title: j.title, stage: j.stage, total: j.total,
      receivedAt: j.receivedAt, collectedAt: j.collectedAt,
    })),
  });
});
