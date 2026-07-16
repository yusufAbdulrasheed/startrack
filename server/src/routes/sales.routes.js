import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { Customer } from "../models/Customer.js";
import { requirePerm, requireBranch, canSeeCost } from "../middleware/tenant.js";
import { applyMovement, InsufficientStockError } from "../lib/inventoryService.js";
import { nextSeq } from "../lib/counters.js";
import { bumpDailyMetric, localDay } from "../lib/metrics.js";
import { money } from "../lib/money.js";
import { audit } from "../lib/audit.js";

export const salesRouter = Router();

function shapeSale(s, showCost) {
  return {
    id: s._id,
    saleNo: s.saleNo,
    at: s.at,
    staffName: s.staffName,
    customerId: s.customerId || null,
    customerName: s.customerName,
    items: s.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
      lineNet: i.lineNet,
      returnedQty: i.returnedQty,
      ...(showCost ? { lineCost: i.lineCost } : {}),
    })),
    subtotal: s.subtotal,
    discount: s.discount,
    vat: s.vat,
    total: s.total,
    payments: s.payments,
    status: s.status,
    voidInfo: s.status === "voided" ? { byName: s.voidInfo?.byName, reason: s.voidInfo?.reason, at: s.voidInfo?.at } : undefined,
  };
}

const checkoutSchema = z.object({
  items: z
    .array(z.object({ productId: z.string(), qty: z.number().int().positive() }))
    .min(1, "The cart is empty"),
  discount: z.number().min(0).default(0),
  payments: z
    .array(z.object({ method: z.enum(["cash", "pos", "transfer"]), amount: z.number().min(0) }))
    .min(1, "Choose a payment method"),
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), phone: z.string().default("") }).optional(),
  clientSaleId: z.string().optional(), // offline-queue idempotency
});

// POST /api/sales — checkout. Stock moves, the sale lands, the customer and
// the day's metrics update. Prices are ALWAYS the server's, never the client's.
salesRouter.post("/", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  // Idempotent replay: the offline queue can safely retry.
  if (d.clientSaleId) {
    const existing = await Sale.findOne({ businessId: req.ctx.businessId, clientSaleId: d.clientSaleId });
    if (existing) return res.status(200).json({ sale: shapeSale(existing, canSeeCost(req.ctx)), replayed: true });
  }

  // Merge duplicate lines so stock guards see true quantities.
  const qtyByProduct = new Map();
  for (const item of d.items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.qty);
  }

  const products = await Product.find({
    _id: { $in: [...qtyByProduct.keys()] },
    businessId: req.ctx.businessId,
    status: "active",
  });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  if (byId.size !== qtyByProduct.size) {
    return res.status(400).json({ error: "invalid", message: "One of the products no longer exists." });
  }

  // Server-side pricing and totals.
  const lines = [...qtyByProduct.entries()].map(([productId, qty]) => {
    const p = byId.get(productId);
    return {
      productId: p._id,
      name: p.name,
      qty,
      unitPrice: p.price,
      lineCost: money(p.cost * qty),
      lineNet: money(p.price * qty),
      returnedQty: 0,
    };
  });
  const subtotal = money(lines.reduce((s, l) => s + l.lineNet, 0));
  const discount = money(Math.min(d.discount, subtotal));
  const settings = req.ctx.business.settings;
  const vat = settings.vatEnabled ? money(((subtotal - discount) * settings.vatRate) / 100) : 0;
  const total = money(subtotal - discount + vat);

  const paid = money(d.payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paid - total) > 0.01) {
    return res.status(400).json({ error: "payment_mismatch", message: `Payments (${paid}) don't add up to the total (${total}).` });
  }

  // Resolve the customer before moving stock (cheap to fail early).
  let customer = null;
  if (d.customerId) {
    customer = await Customer.findOne({ _id: d.customerId, businessId: req.ctx.businessId });
    if (!customer) return res.status(400).json({ error: "invalid", message: "That customer doesn't exist." });
  } else if (d.customer?.name) {
    customer =
      (d.customer.phone && (await Customer.findOne({ businessId: req.ctx.businessId, phone: d.customer.phone }))) ||
      (await Customer.create({
        accountId: req.ctx.accountId,
        businessId: req.ctx.businessId,
        name: d.customer.name,
        phone: d.customer.phone,
        whatsapp: d.customer.phone,
      }));
  }

  // Mint the sale id up front so every movement points at it from birth.
  const saleId = new mongoose.Types.ObjectId();

  // Move stock line by line; compensate on failure so nothing half-commits.
  const moved = [];
  try {
    for (const line of lines) {
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId,
        productId: line.productId,
        productName: line.name,
        type: "OUT",
        qty: -line.qty,
        refType: "sale",
        refId: saleId,
        reason: "Sale",
      });
      moved.push(line);
    }
  } catch (err) {
    for (const line of moved.reverse()) {
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId, productId: line.productId, productName: line.name,
        type: "IN", qty: line.qty, refType: "sale", reason: "Checkout rollback",
      }).catch(() => {});
    }
    if (err instanceof InsufficientStockError) {
      return res.status(409).json({ error: err.code, message: err.message });
    }
    throw err;
  }

  const seq = await nextSeq(`sale:${req.ctx.branchId}`);
  const saleNo = `R-${String(seq).padStart(5, "0")}`;

  const sale = await Sale.create({
    _id: saleId,
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    saleNo,
    staffId: req.ctx.userId,
    staffName: req.ctx.actorName,
    customerId: customer?._id,
    customerName: customer?.name || "",
    items: lines,
    subtotal,
    discount,
    vat,
    total,
    payments: d.payments.map((p) => ({ method: p.method, amount: money(p.amount) })),
    clientSaleId: d.clientSaleId,
  });

  if (customer) {
    customer.totalSpend = money(customer.totalSpend + total);
    customer.visits += 1;
    customer.lastSeen = new Date();
    customer.lastBranchId = req.ctx.branchId;
    await customer.save();
  }

  const totalCost = money(lines.reduce((s, l) => s + l.lineCost, 0));
  const payments = {};
  for (const p of d.payments) payments[p.method] = (payments[p.method] || 0) + p.amount;
  await bumpDailyMetric(req.ctx, req.ctx.branchId, localDay(), {
    revenue: total,
    cost: totalCost,
    profit: total - vat - totalCost,
    txns: 1,
    discountTotal: discount,
    vatTotal: vat,
    payments,
  });

  res.status(201).json({
    sale: shapeSale(sale, canSeeCost(req.ctx)),
    receipt: {
      saleNo,
      businessName: req.ctx.business.name,
      at: sale.at,
      staffName: sale.staffName,
      customerName: sale.customerName,
      items: lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineNet: l.lineNet })),
      subtotal,
      discount,
      vat,
      total,
      payments: sale.payments,
      footer: settings.receiptFooter,
      currency: settings.currency,
    },
  });
});

// GET /api/sales?date=YYYY-MM-DD&limit=&mine=1 — branch sales list
salesRouter.get("/", requirePerm("sales", "dashboard_ops"), requireBranch, async (req, res) => {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  if (req.query.mine === "1" || !req.ctx.perms.includes("*") && !req.ctx.perms.includes("dashboard_ops")) {
    // Staff see their own sales only.
    filter.staffId = req.ctx.userId;
  }
  if (req.query.saleNo) {
    filter.saleNo = { $regex: `${String(req.query.saleNo).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  }
  if (req.query.date) {
    const day = new Date(`${req.query.date}T00:00:00`);
    const next = new Date(day.getTime() + 24 * 3600 * 1000);
    filter.at = { $gte: day, $lt: next };
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const sales = await Sale.find(filter).sort({ at: -1 }).limit(limit);
  const showCost = canSeeCost(req.ctx);
  res.json({ sales: sales.map((s) => shapeSale(s, showCost)) });
});

// GET /api/sales/:id — one sale (receipt reprint, return submission)
salesRouter.get("/:id", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!sale) return res.status(404).json({ error: "not_found", message: "Sale not found." });
  res.json({ sale: shapeSale(sale, canSeeCost(req.ctx)) });
});

// POST /api/sales/:id/void — undo: reversing movements + flagged, never deleted
salesRouter.post("/:id/void", requirePerm("void_sales"), async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "invalid", message: "Give a reason for voiding this sale." });

  const sale = await Sale.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!sale) return res.status(404).json({ error: "not_found", message: "Sale not found." });
  if (sale.status === "voided") return res.status(409).json({ error: "already_voided", message: "This sale is already voided." });
  const returned = sale.items.some((i) => i.returnedQty > 0);
  if (returned) return res.status(409).json({ error: "has_returns", message: "This sale has returns — void isn't possible." });

  for (const line of sale.items) {
    await applyMovement(req.ctx, {
      branchId: sale.branchId,
      productId: line.productId,
      productName: line.name,
      type: "VOID_RESTOCK",
      qty: line.qty,
      refType: "sale",
      refId: sale._id,
      reason: `Void ${sale.saleNo}`,
    });
  }

  sale.status = "voided";
  sale.voidInfo = { by: req.ctx.userId, byName: req.ctx.actorName, reason, at: new Date() };
  await sale.save();

  if (sale.customerId) {
    const customer = await Customer.findById(sale.customerId);
    if (customer) {
      customer.totalSpend = money(Math.max(0, customer.totalSpend - sale.total));
      customer.visits = Math.max(0, customer.visits - 1);
      await customer.save();
    }
  }

  const totalCost = money(sale.items.reduce((s, l) => s + l.lineCost, 0));
  const payments = {};
  for (const p of sale.payments) payments[p.method] = (payments[p.method] || 0) - p.amount;
  await bumpDailyMetric(req.ctx, sale.branchId, localDay(sale.at), {
    revenue: -sale.total,
    cost: -totalCost,
    profit: -(sale.total - sale.vat - totalCost),
    txns: -1,
    discountTotal: -sale.discount,
    vatTotal: -sale.vat,
    payments,
  });

  audit(req.ctx, "sale.void", { type: "sale", id: sale._id, label: sale.saleNo }, { total: sale.total }, { reason });
  res.json({ sale: shapeSale(sale, canSeeCost(req.ctx)) });
});
