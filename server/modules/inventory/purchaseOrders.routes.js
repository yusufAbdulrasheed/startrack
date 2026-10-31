import { waUrl } from "#core/share.js";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { PurchaseOrder, PO_STATUSES } from "#modules/inventory/purchaseOrder.model.js";
import { Product } from "#modules/products/product.model.js";
import { Supplier } from "#modules/suppliers/supplier.model.js";
import { requirePerm, requireBranch, canSeeCost } from "#core/middleware/tenant.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { afterStockChange } from "#modules/alerts/alerts.service.js";
import { nextSeq } from "#core/counters.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";
import { scopedToBranch } from "#core/branchScope.js";

/**
 * Purchase orders: ask a supplier for stock, then book it in when it arrives.
 * Prices are on every line, so the whole module needs a role that may see cost.
 */
export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(requirePerm("stock"), (req, res, next) =>
  canSeeCost(req.ctx) ? next() : res.status(403).json({ error: "forbidden", message: "Purchase orders show cost prices, which your role can't see." })
);

const oidOk = (v) => mongoose.isValidObjectId(v);
const sumTotal = (lines) => money(lines.reduce((t, l) => t + l.qty * l.unitCost, 0));
const outstanding = (po) => po.lines.reduce((t, l) => t + Math.max(0, l.qty - l.receivedQty), 0);

const shape = (po) => ({
  id: String(po._id), poNo: po.poNo, status: po.status, supplierId: po.supplierId ? String(po.supplierId) : null, supplierName: po.supplierName,
  lines: po.lines.map((l) => ({ productId: String(l.productId), name: l.name, unit: l.unit, qty: l.qty, unitCost: l.unitCost, receivedQty: l.receivedQty, lineTotal: money(l.qty * l.unitCost) })),
  total: po.total, expectedDate: po.expectedDate, notes: po.notes, createdBy: po.createdBy, createdAt: po.createdAt, sentAt: po.sentAt || null,
  receipts: po.receipts.map((r) => ({ at: r.at, by: r.by, lines: r.lines })),
  outstandingUnits: outstanding(po),
});

const lineSchema = z.object({ productId: z.string().refine(oidOk, "Pick a product"), qty: z.number().positive().max(1_000_000), unitCost: z.number().min(0).max(100_000_000) });
const bodySchema = z.object({
  supplierId: z.string().refine(oidOk).nullable().optional(),
  supplierName: z.string().trim().max(120).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item").max(200),
  expectedDate: z.string().nullable().optional(),
  notes: z.string().trim().max(500).optional(),
});

/** Names and units come from the catalog, never from the browser. */
async function buildLines(ctx, lines) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await Product.find(scopedToBranch(ctx, { _id: { $in: ids }, businessId: ctx.businessId, status: "active" })).select("name unit");
  const by = new Map(products.map((p) => [String(p._id), p]));
  const merged = new Map();
  for (const l of lines) {
    const p = by.get(l.productId);
    if (!p) return { error: "One of those products isn't in your catalog any more." };
    const ex = merged.get(l.productId);
    if (ex) { ex.qty += l.qty; ex.unitCost = l.unitCost; }
    else merged.set(l.productId, { productId: p._id, name: p.name, unit: p.unit || "unit", qty: l.qty, unitCost: l.unitCost, receivedQty: 0 });
  }
  return { lines: [...merged.values()] };
}

async function supplierFields(ctx, d) {
  if (d.supplierId) {
    const s = await Supplier.findOne({ _id: d.supplierId, businessId: ctx.businessId }).select("name contact");
    if (!s) return { error: "That supplier doesn't exist." };
    return { supplierId: s._id, supplierName: s.name, contact: s.contact || "" };
  }
  return { supplierId: null, supplierName: d.supplierName || "", contact: "" };
}

// GET /api/purchase-orders?status=open|all|<status>&page=
purchaseOrdersRouter.get("/", requireBranch, async (req, res) => {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  const status = String(req.query.status || "open");
  if (status === "open") filter.status = { $in: ["draft", "sent", "partial"] };
  else if (PO_STATUSES.includes(status)) filter.status = status;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [rows, total] = await Promise.all([
    PurchaseOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PurchaseOrder.countDocuments(filter),
  ]);
  res.json({ orders: rows.map(shape), page, pages: Math.max(1, Math.ceil(total / limit)), total });
});

async function load(req, res) {
  if (!oidOk(req.params.id)) { res.status(404).json({ error: "not_found", message: "Purchase order not found." }); return null; }
  const po = await PurchaseOrder.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!po) res.status(404).json({ error: "not_found", message: "Purchase order not found." });
  return po;
}

purchaseOrdersRouter.get("/:id", async (req, res) => {
  const po = await load(req, res);
  if (po) res.json({ order: shape(po) });
});

// POST /api/purchase-orders — a new draft
purchaseOrdersRouter.post("/", requireBranch, async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  const built = await buildLines(req.ctx, d.lines);
  if (built.error) return res.status(400).json({ error: "invalid", message: built.error });
  const sup = await supplierFields(req.ctx, d);
  if (sup.error) return res.status(400).json({ error: "invalid", message: sup.error });

  const seq = await nextSeq(`po:${req.ctx.businessId}`);
  const po = await PurchaseOrder.create({
    accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId: req.ctx.branchId,
    poNo: `PO-${String(seq).padStart(4, "0")}`, supplierId: sup.supplierId, supplierName: sup.supplierName,
    lines: built.lines, total: sumTotal(built.lines), expectedDate: d.expectedDate ? new Date(d.expectedDate) : null, notes: d.notes || "", createdBy: req.ctx.actorName,
  });
  audit(req.ctx, "po.create", { type: "purchase_order", id: po._id, label: po.poNo }, undefined, { total: po.total, lines: po.lines.length });
  res.status(201).json({ order: shape(po) });
});

// PUT /api/purchase-orders/:id — change a draft
purchaseOrdersRouter.put("/:id", async (req, res) => {
  const po = await load(req, res);
  if (!po) return;
  if (po.status !== "draft") return res.status(409).json({ error: "locked", message: "Only a draft can be edited. This one has already been sent." });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  const built = await buildLines(req.ctx, d.lines);
  if (built.error) return res.status(400).json({ error: "invalid", message: built.error });
  const sup = await supplierFields(req.ctx, d);
  if (sup.error) return res.status(400).json({ error: "invalid", message: sup.error });
  po.supplierId = sup.supplierId; po.supplierName = sup.supplierName; po.lines = built.lines; po.total = sumTotal(built.lines);
  po.expectedDate = d.expectedDate ? new Date(d.expectedDate) : null; po.notes = d.notes || "";
  await po.save();
  res.json({ order: shape(po) });
});

// POST /api/purchase-orders/:id/send — mark as sent, and hand back a message to share
purchaseOrdersRouter.post("/:id/send", async (req, res) => {
  const po = await load(req, res);
  if (!po) return;
  if (po.status !== "draft") return res.status(409).json({ error: "locked", message: "This order was already sent." });
  po.status = "sent"; po.sentAt = new Date();
  await po.save();
  const supplier = po.supplierId ? await Supplier.findById(po.supplierId).select("contact") : null;
  const business = req.ctx.business.tradingName || req.ctx.business.name;
  const text = [
    `Hello${po.supplierName ? ` ${po.supplierName}` : ""}, order ${po.poNo} from ${business}:`,
    ...po.lines.map((l) => `• ${l.name} × ${l.qty} ${l.unit}`),
    po.expectedDate ? `Needed by ${po.expectedDate.toISOString().slice(0, 10)}.` : "",
    po.notes ? `Note: ${po.notes}` : "",
    "Please confirm availability. Thank you!",
  ].filter(Boolean).join("\n");
  const wa = supplier?.contact ? waUrl(supplier.contact, text) : "";
  audit(req.ctx, "po.send", { type: "purchase_order", id: po._id, label: po.poNo });
  res.json({ order: shape(po), shareText: text, whatsappUrl: wa });
});

const receiveSchema = z.object({
  lines: z.array(z.object({ productId: z.string().refine(oidOk), qty: z.number().positive().max(1_000_000), unitCost: z.number().min(0).optional() })).min(1, "Enter what arrived"),
  updateCost: z.boolean().default(true),
});

// POST /api/purchase-orders/:id/receive — goods arrived (all or part): add them to the shelf
purchaseOrdersRouter.post("/:id/receive", requireBranch, async (req, res) => {
  const po = await load(req, res);
  if (!po) return;
  if (!["sent", "partial", "draft"].includes(po.status)) return res.status(409).json({ error: "locked", message: `This order is ${po.status}; nothing more can be received.` });
  if (String(po.branchId) !== String(req.ctx.branchId)) return res.status(409).json({ error: "wrong_store", message: "These goods were ordered for a different store. Switch to that store to receive them." });
  const parsed = receiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const byId = new Map(po.lines.map((l) => [String(l.productId), l]));
  const batch = [];
  for (const r of parsed.data.lines) {
    const line = byId.get(r.productId);
    if (!line) return res.status(400).json({ error: "invalid", message: "That item isn't on this order." });
    const left = Math.round((line.qty - line.receivedQty) * 1000) / 1000;
    if (r.qty > left + 1e-9) return res.status(400).json({ error: "invalid", message: `${line.name}: only ${left} still to come, you entered ${r.qty}.` });
    batch.push({ line, qty: r.qty, unitCost: r.unitCost ?? line.unitCost });
  }

  for (const b of batch) {
    await applyMovement(req.ctx, {
      branchId: req.ctx.branchId, productId: b.line.productId, productName: b.line.name, type: "IN", qty: b.qty,
      refType: "purchase_order", refId: po._id, reason: `Received on ${po.poNo}`, unitCost: b.unitCost, supplierId: po.supplierId, supplierName: po.supplierName,
    });
    b.line.receivedQty = Math.round((b.line.receivedQty + b.qty) * 1000) / 1000;
    if (parsed.data.updateCost) await Product.updateOne({ _id: b.line.productId }, { $set: { cost: b.unitCost } });
  }
  po.receipts.push({ at: new Date(), by: req.ctx.actorName, lines: batch.map((b) => ({ productId: b.line.productId, name: b.line.name, qty: b.qty, unitCost: b.unitCost })) });
  po.status = outstanding(po) <= 1e-9 ? "received" : "partial";
  po.total = sumTotal(po.lines);
  await po.save();
  afterStockChange(req.ctx, req.ctx.branchId, batch.map((b) => b.line.productId));
  audit(req.ctx, "po.receive", { type: "purchase_order", id: po._id, label: po.poNo }, undefined, { items: batch.length, status: po.status });
  res.json({ order: shape(po) });
});

// POST /api/purchase-orders/:id/cancel
purchaseOrdersRouter.post("/:id/cancel", async (req, res) => {
  const po = await load(req, res);
  if (!po) return;
  if (["received", "cancelled", "closed"].includes(po.status)) return res.status(409).json({ error: "locked", message: `This order is already ${po.status}.` });
  // Goods that already arrived stay on the shelf; what never came is simply no longer expected.
  po.status = po.receipts.length ? "closed" : "cancelled";
  await po.save();
  audit(req.ctx, "po.cancel", { type: "purchase_order", id: po._id, label: po.poNo }, undefined, { status: po.status });
  res.json({ order: shape(po) });
});
