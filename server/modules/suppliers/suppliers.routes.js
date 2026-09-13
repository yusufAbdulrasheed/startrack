import { Router } from "express";
import { z } from "zod";
import { Supplier } from "#modules/suppliers/supplier.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { requirePerm } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const suppliersRouter = Router();

function shape(s) {
  return {
    id: s._id,
    name: s.name,
    contact: s.contact,
    type: s.type,
    paymentTerms: s.paymentTerms,
    notes: s.notes,
  };
}

// GET /api/suppliers?q=
suppliersRouter.get("/", requirePerm("stock", "dashboard_ops"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: "i" };
  const suppliers = await Supplier.find(filter).sort({ name: 1 }).limit(200);
  res.json({ suppliers: suppliers.map(shape) });
});

const supplierSchema = z.object({
  name: z.string().min(1, "Name is required"),
  contact: z.string().default(""),
  type: z.enum(["market", "distributor", "one_off"]).default("market"),
  paymentTerms: z.enum(["cash", "credit"]).default("cash"),
  notes: z.string().default(""),
});

// POST /api/suppliers
suppliersRouter.post("/", requirePerm("stock"), async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const supplier = await Supplier.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    ...parsed.data,
  });
  audit(req.ctx, "supplier.create", { type: "supplier", id: supplier._id, label: supplier.name });
  res.status(201).json({ supplier: shape(supplier) });
});

// PATCH /api/suppliers/:id
suppliersRouter.patch("/:id", requirePerm("stock"), async (req, res) => {
  const parsed = supplierSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const supplier = await Supplier.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!supplier) return res.status(404).json({ error: "not_found", message: "Supplier not found." });
  Object.assign(supplier, parsed.data);
  await supplier.save();
  res.json({ supplier: shape(supplier) });
});

// DELETE /api/suppliers/:id — the delivery history in the ledger keeps the
// supplier's name (denormalized), so this never orphans past records.
suppliersRouter.delete("/:id", requirePerm("stock"), async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!supplier) return res.status(404).json({ error: "not_found", message: "Supplier not found." });
  await supplier.deleteOne();
  audit(req.ctx, "supplier.delete", { type: "supplier", id: supplier._id, label: supplier.name });
  res.json({ ok: true });
});

// GET /api/suppliers/:id/deliveries — recent stock-in history from this
// supplier, straight from the ledger. No separate price-history collection:
// the append-only StockMovement log already IS the price history.
suppliersRouter.get("/:id/deliveries", requirePerm("stock", "dashboard_ops"), async (req, res) => {
  const supplier = await Supplier.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!supplier) return res.status(404).json({ error: "not_found", message: "Supplier not found." });
  const movements = await StockMovement.find({ businessId: req.ctx.businessId, supplierId: supplier._id })
    .sort({ at: -1 })
    .limit(50);
  res.json({
    deliveries: movements.map((m) => ({
      id: m._id,
      productName: m.productName,
      qty: m.qty,
      unitCost: m.unitCost,
      at: m.at,
      branchId: m.branchId,
    })),
  });
});
