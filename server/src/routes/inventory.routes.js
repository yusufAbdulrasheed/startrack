import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { StockMovement } from "../models/StockMovement.js";
import { Branch } from "../models/Branch.js";
import { requirePerm, requireBranch } from "../middleware/tenant.js";
import { applyMovement, InsufficientStockError } from "../lib/inventoryService.js";
import { audit } from "../lib/audit.js";

export const inventoryRouter = Router();

const stockInSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), qty: z.number().int().positive("Quantity must be positive") }))
    .min(1, "Add at least one product"),
  note: z.string().default(""),
});

// POST /api/inventory/stock-in — receive goods into the active branch
inventoryRouter.post("/stock-in", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = stockInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { items, note } = parsed.data;

  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) }, businessId: req.ctx.businessId });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (byId.size !== items.length) {
    return res.status(400).json({ error: "invalid", message: "One of those products doesn't exist." });
  }

  const results = [];
  for (const item of items) {
    const product = byId.get(item.productId);
    const balance = await applyMovement(req.ctx, {
      branchId: req.ctx.branchId,
      productId: product._id,
      productName: product.name,
      type: "IN",
      qty: item.qty,
      refType: "manual",
      reason: note || "Stock in",
    });
    results.push({ productId: product._id, name: product.name, added: item.qty, stock: balance });
  }
  res.status(201).json({ items: results });
});

const adjustSchema = z.object({
  productId: z.string(),
  newQty: z.number().int().min(0, "Stock can't go negative"),
  reason: z.string().min(3, "Give a reason for the adjustment"),
});

// POST /api/inventory/adjust — set a corrected count (shrinkage, recount…)
inventoryRouter.post("/adjust", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { productId, newQty, reason } = parsed.data;

  const product = await Product.findOne({ _id: productId, businessId: req.ctx.businessId });
  if (!product) return res.status(404).json({ error: "not_found", message: "Product not found." });

  const inv = await Inventory.findOne({ branchId: req.ctx.branchId, productId });
  const current = inv?.stock ?? 0;
  const delta = newQty - current;
  if (delta === 0) return res.json({ productId, stock: current, changed: 0 });

  const balance = await applyMovement(req.ctx, {
    branchId: req.ctx.branchId,
    productId: product._id,
    productName: product.name,
    type: "ADJUST",
    qty: delta,
    refType: "manual",
    reason,
  });
  audit(req.ctx, "stock.adjust", { type: "product", id: product._id, label: product.name }, { stock: current }, { stock: balance, reason });
  res.json({ productId, stock: balance, changed: delta });
});

const transferSchema = z.object({
  toBranchId: z.string(),
  items: z
    .array(z.object({ productId: z.string(), qty: z.number().int().positive() }))
    .min(1, "Add at least one product"),
  note: z.string().default(""),
});

// POST /api/inventory/transfer — move stock from the active branch to another
inventoryRouter.post("/transfer", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { toBranchId, items, note } = parsed.data;

  if (String(toBranchId) === String(req.ctx.branchId)) {
    return res.status(400).json({ error: "invalid", message: "Source and destination branch are the same." });
  }
  const toBranch = await Branch.findOne({ _id: toBranchId, businessId: req.ctx.businessId });
  if (!toBranch) return res.status(400).json({ error: "invalid", message: "Destination branch doesn't exist." });

  const products = await Product.find({ _id: { $in: items.map((i) => i.productId) }, businessId: req.ctx.businessId });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (byId.size !== items.length) {
    return res.status(400).json({ error: "invalid", message: "One of those products doesn't exist." });
  }

  const transferId = new mongoose.Types.ObjectId(); // links OUT and IN movements
  const results = [];
  const done = []; // for compensation if a later line fails
  try {
    for (const item of items) {
      const product = byId.get(item.productId);
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId,
        productId: product._id,
        productName: product.name,
        type: "TRANSFER_OUT",
        qty: -item.qty,
        refType: "transfer",
        refId: transferId,
        reason: note || `To ${toBranch.name}`,
      });
      const inBalance = await applyMovement(req.ctx, {
        branchId: toBranch._id,
        productId: product._id,
        productName: product.name,
        type: "TRANSFER_IN",
        qty: item.qty,
        refType: "transfer",
        refId: transferId,
        reason: note || `From branch`,
      });
      done.push({ product, qty: item.qty });
      results.push({ productId: product._id, name: product.name, qty: item.qty, destStock: inBalance });
    }
  } catch (err) {
    // Reverse the lines that already moved so branches stay consistent.
    for (const d of done.reverse()) {
      await applyMovement(req.ctx, {
        branchId: toBranch._id, productId: d.product._id, productName: d.product.name,
        type: "TRANSFER_OUT", qty: -d.qty, refType: "transfer", refId: transferId, reason: "Transfer reversal",
      }).catch(() => {});
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId, productId: d.product._id, productName: d.product.name,
        type: "TRANSFER_IN", qty: d.qty, refType: "transfer", refId: transferId, reason: "Transfer reversal",
      }).catch(() => {});
    }
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({ error: err.code, message: err.message });
    }
    throw err;
  }

  audit(req.ctx, "stock.transfer", { type: "transfer", id: transferId, label: `→ ${toBranch.name}` }, undefined, {
    items: results.map((r) => ({ name: r.name, qty: r.qty })),
  });
  res.status(201).json({ transferId, toBranch: toBranch.name, items: results });
});

// GET /api/inventory/movements?productId=&type=&limit= — the ledger
inventoryRouter.get("/movements", requirePerm("stock", "dashboard_ops"), requireBranch, async (req, res) => {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  if (req.query.productId) filter.productId = req.query.productId;
  if (req.query.type) filter.type = req.query.type;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const movements = await StockMovement.find(filter).sort({ at: -1 }).limit(limit);
  res.json({
    movements: movements.map((m) => ({
      id: m._id,
      productId: m.productId,
      productName: m.productName,
      type: m.type,
      qty: m.qty,
      balanceAfter: m.balanceAfter,
      reason: m.reason,
      refType: m.refType,
      actorName: m.actorName,
      at: m.at,
    })),
  });
});

// GET /api/inventory/low-stock — products at/below their reorder level
inventoryRouter.get("/low-stock", requireBranch, async (req, res) => {
  const products = await Product.find({ businessId: req.ctx.businessId, status: "active" }).select("name reorderLevel");
  const inv = await Inventory.find({ branchId: req.ctx.branchId, productId: { $in: products.map((p) => p._id) } });
  const stockBy = new Map(inv.map((i) => [String(i.productId), i.stock]));
  const low = products
    .map((p) => ({ id: p._id, name: p.name, stock: stockBy.get(String(p._id)) ?? 0, reorderLevel: p.reorderLevel }))
    .filter((p) => p.stock <= p.reorderLevel)
    .sort((a, b) => a.stock - b.stock);
  res.json({ items: low });
});
