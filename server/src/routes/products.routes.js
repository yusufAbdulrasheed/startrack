import { Router } from "express";
import { z } from "zod";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { requirePerm, canSeeCost } from "../middleware/tenant.js";
import { audit } from "../lib/audit.js";
import { money, isValidAmount } from "../lib/money.js";

export const productsRouter = Router();

function shape(p, stockByProduct, showCost) {
  const out = {
    id: p._id,
    name: p.name,
    barcode: p.barcode,
    category: p.category,
    price: p.price,
    reorderLevel: p.reorderLevel,
    expiry: p.expiry || null,
    status: p.status,
    stock: stockByProduct ? stockByProduct.get(String(p._id)) ?? 0 : undefined,
    createdAt: p.createdAt,
  };
  if (showCost) out.cost = p.cost;
  return out;
}

// GET /api/products?q=&category=&status= — catalog with the active branch's stock.
// Staff-safe: cost is stripped for roles without the finance permission.
productsRouter.get("/", async (req, res) => {
  const filter = { businessId: req.ctx.businessId, status: req.query.status === "archived" ? "archived" : "active" };
  if (req.query.category && req.query.category !== "All") filter.category = req.query.category;
  if (req.query.q) filter.name = { $regex: String(req.query.q).trim(), $options: "i" };

  const products = await Product.find(filter).sort({ name: 1 }).limit(1000);
  let stockByProduct = null;
  if (req.ctx.branchId) {
    const inv = await Inventory.find({ branchId: req.ctx.branchId, productId: { $in: products.map((p) => p._id) } });
    stockByProduct = new Map(inv.map((i) => [String(i.productId), i.stock]));
  }
  const showCost = canSeeCost(req.ctx);
  res.json({ products: products.map((p) => shape(p, stockByProduct, showCost)) });
});

// GET /api/products/categories — distinct category list for filters
productsRouter.get("/categories", async (req, res) => {
  const cats = await Product.distinct("category", { businessId: req.ctx.businessId, status: "active" });
  res.json({ categories: cats.sort((a, b) => a.localeCompare(b)) });
});

// GET /api/products/barcode/:code — scanner lookup on the POS
productsRouter.get("/barcode/:code", async (req, res) => {
  const p = await Product.findOne({ businessId: req.ctx.businessId, barcode: req.params.code, status: "active" });
  if (!p) return res.status(404).json({ error: "not_found", message: "No product with that barcode." });
  let stock = 0;
  if (req.ctx.branchId) {
    const inv = await Inventory.findOne({ branchId: req.ctx.branchId, productId: p._id });
    stock = inv?.stock ?? 0;
  }
  res.json({ product: { ...shape(p, null, canSeeCost(req.ctx)), stock } });
});

const productSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  barcode: z.string().default(""),
  category: z.string().min(1).default("General"),
  price: z.number().min(0, "Price can't be negative"),
  cost: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(5),
  // Accepts "YYYY-MM-DD" from a date input; empty string clears it.
  expiry: z
    .string()
    .refine((s) => s === "" || !Number.isNaN(new Date(s).getTime()), "Invalid expiry date")
    .nullable()
    .optional(),
  openingStock: z.number().int().min(0).default(0), // convenience on create
});

// POST /api/products — requires the prices permission
productsRouter.post("/", requirePerm("prices"), async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  if (d.barcode) {
    const dupe = await Product.findOne({ businessId: req.ctx.businessId, barcode: d.barcode, status: "active" });
    if (dupe) return res.status(409).json({ error: "barcode_taken", message: `Barcode already on "${dupe.name}".` });
  }

  const product = await Product.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    name: d.name,
    barcode: d.barcode,
    category: d.category,
    price: money(d.price),
    cost: money(d.cost),
    reorderLevel: d.reorderLevel,
    expiry: d.expiry ? new Date(d.expiry) : undefined,
  });

  // Opening stock lands as a proper IN movement so the ledger starts correct.
  if (d.openingStock > 0 && req.ctx.branchId) {
    const { applyMovement } = await import("../lib/inventoryService.js");
    await applyMovement(req.ctx, {
      branchId: req.ctx.branchId,
      productId: product._id,
      productName: product.name,
      type: "IN",
      qty: d.openingStock,
      refType: "manual",
      reason: "Opening stock",
    });
  }

  audit(req.ctx, "product.create", { type: "product", id: product._id, label: product.name }, undefined, {
    price: product.price,
    cost: product.cost,
  });
  res.status(201).json({ product: { ...shape(product, null, canSeeCost(req.ctx)), stock: d.openingStock } });
});

const importRowSchema = z.object({
  name: z.string().min(1),
  category: z.string().default("General"),
  barcode: z.string().default(""),
  price: z.number().min(0),
  cost: z.number().min(0).default(0),
  reorderLevel: z.number().min(0).default(5),
  openingStock: z.number().int().min(0).default(0),
  expiry: z.string().default(""),
});

// POST /api/products/import — bulk import (CSV parsed client-side into rows).
// All-or-nothing per row: bad rows are reported and skipped, good rows land.
// Duplicate names (case-insensitive) and barcodes already in the catalog are skipped.
productsRouter.post("/import", requirePerm("prices"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: "invalid", message: "No rows to import." });
  if (rows.length > 2000) return res.status(400).json({ error: "too_many", message: "Import at most 2,000 products at a time." });

  const existing = await Product.find({ businessId: req.ctx.businessId, status: "active" }).select("name barcode");
  const namesTaken = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const barcodesTaken = new Set(existing.filter((p) => p.barcode).map((p) => p.barcode));

  const { applyMovement } = await import("../lib/inventoryService.js");
  const results = { created: 0, skipped: [] };

  for (let i = 0; i < rows.length; i++) {
    const parsed = importRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      results.skipped.push({ row: i + 1, name: rows[i]?.name || "(no name)", reason: parsed.error.issues[0].message });
      continue;
    }
    const d = parsed.data;
    const nameKey = d.name.trim().toLowerCase();
    if (namesTaken.has(nameKey)) {
      results.skipped.push({ row: i + 1, name: d.name, reason: "Already in catalog (same name)" });
      continue;
    }
    if (d.barcode && barcodesTaken.has(d.barcode)) {
      results.skipped.push({ row: i + 1, name: d.name, reason: "Barcode already in use" });
      continue;
    }
    const expiryDate = d.expiry && !Number.isNaN(new Date(d.expiry).getTime()) ? new Date(d.expiry) : undefined;

    const product = await Product.create({
      accountId: req.ctx.accountId,
      businessId: req.ctx.businessId,
      name: d.name.trim(),
      barcode: d.barcode.trim(),
      category: d.category.trim() || "General",
      price: money(d.price),
      cost: money(d.cost),
      reorderLevel: d.reorderLevel,
      expiry: expiryDate,
    });
    namesTaken.add(nameKey);
    if (d.barcode) barcodesTaken.add(d.barcode);

    if (d.openingStock > 0 && req.ctx.branchId) {
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId,
        productId: product._id,
        productName: product.name,
        type: "IN",
        qty: d.openingStock,
        refType: "manual",
        reason: "CSV import — opening stock",
      });
    }
    results.created++;
  }

  audit(req.ctx, "product.import", { type: "product", label: `${results.created} imported` }, undefined, {
    created: results.created,
    skipped: results.skipped.length,
  });
  res.status(201).json(results);
});

// PATCH /api/products/:id — price changes are audited with before/after
productsRouter.patch("/:id", requirePerm("prices"), async (req, res) => {
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  const product = await Product.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!product) return res.status(404).json({ error: "not_found", message: "Product not found." });

  if (d.barcode && d.barcode !== product.barcode) {
    const dupe = await Product.findOne({ businessId: req.ctx.businessId, barcode: d.barcode, status: "active", _id: { $ne: product._id } });
    if (dupe) return res.status(409).json({ error: "barcode_taken", message: `Barcode already on "${dupe.name}".` });
  }

  const before = { name: product.name, price: product.price, cost: product.cost };
  if (d.name !== undefined) product.name = d.name;
  if (d.barcode !== undefined) product.barcode = d.barcode;
  if (d.category !== undefined) product.category = d.category;
  if (d.price !== undefined && isValidAmount(d.price)) product.price = money(d.price);
  if (d.cost !== undefined && isValidAmount(d.cost)) product.cost = money(d.cost);
  if (d.reorderLevel !== undefined) product.reorderLevel = d.reorderLevel;
  if (d.expiry !== undefined) product.expiry = d.expiry ? new Date(d.expiry) : undefined;
  await product.save();

  if (before.price !== product.price || before.cost !== product.cost) {
    audit(req.ctx, "product.price_change", { type: "product", id: product._id, label: product.name }, before, {
      name: product.name,
      price: product.price,
      cost: product.cost,
    });
  }
  res.json({ product: shape(product, null, canSeeCost(req.ctx)) });
});

// DELETE /api/products/:id — archive, never hard-delete (sales history points here)
productsRouter.delete("/:id", requirePerm("prices"), async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!product) return res.status(404).json({ error: "not_found", message: "Product not found." });
  product.status = "archived";
  await product.save();
  audit(req.ctx, "product.archive", { type: "product", id: product._id, label: product.name });
  res.json({ ok: true });
});
