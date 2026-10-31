import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Order, ORDER_STATUSES } from "#modules/storefront/order.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { requirePerm } from "#core/middleware/tenant.js";
import { HttpError } from "#core/httpError.js";
import { InsufficientStockError } from "#modules/inventory/inventory.service.js";
import { shapeOrder, storeOf } from "#modules/storefront/store.service.js";
import { confirmOrder, rejectOrder, advanceOrder, markPaid, tellCustomer } from "#modules/storefront/orders.service.js";
import { escapeRegex } from "#core/regex.js";

/**
 * The owner's side of the online store: /api/orders. Same permission as
 * ringing up sales — whoever may sell may handle the web's orders.
 */
export const ordersRouter = Router();
ordersRouter.use(requirePerm("sales"));

const OPEN = ["placed", "confirmed", "ready", "out_for_delivery"];

const reply = (res, err) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err instanceof InsufficientStockError) return res.status(409).json({ error: err.code, message: `Not enough stock to confirm this order: ${err.message}` });
  throw err;
};

async function load(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ error: "not_found", message: "Order not found." }); return null; }
  const order = await Order.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!order) res.status(404).json({ error: "not_found", message: "Order not found." });
  return order;
}

// GET /api/orders/summary — the badge, and the owner's "is the web paying off" numbers
ordersRouter.get("/summary", async (req, res) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const onlineSales = (from) => Sale.aggregate([
    { $match: { businessId: req.ctx.businessId, channel: "online", status: "completed", at: { $gte: from } } },
    { $group: { _id: null, revenue: { $sum: "$total" }, n: { $sum: 1 } } },
  ]);
  const [byStatus, online30, onlineToday] = await Promise.all([
    Order.aggregate([{ $match: { businessId: req.ctx.businessId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    onlineSales(since30),
    onlineSales(today),
  ]);
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  for (const r of byStatus) counts[r._id] = r.n;
  res.json({
    counts,
    waiting: counts.placed,
    open: OPEN.reduce((t, s) => t + counts[s], 0),
    online30d: { revenue: online30[0]?.revenue || 0, orders: online30[0]?.n || 0 },
    onlineToday: { revenue: onlineToday[0]?.revenue || 0, orders: onlineToday[0]?.n || 0 },
    storeEnabled: !!storeOf(req.ctx.business).enabled,
  });
});

// GET /api/orders?status=open|closed|all|<status>&q=&customerId=&page=
ordersRouter.get("/", async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  const status = String(req.query.status || "open");
  if (status === "open") filter.status = { $in: OPEN };
  else if (status === "closed") filter.status = { $in: ["completed", "cancelled", "rejected"] };
  else if (ORDER_STATUSES.includes(status)) filter.status = status;
  if (req.query.q) {
    const q = escapeRegex(String(req.query.q).trim().slice(0, 60));
    filter.$or = [{ orderNo: { $regex: q, $options: "i" } }, { "contact.name": { $regex: q, $options: "i" } }, { "contact.phone": { $regex: q } }];
  }
  if (req.query.customerId && mongoose.isValidObjectId(req.query.customerId)) filter.customerId = req.query.customerId;

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [rows, total] = await Promise.all([
    // Oldest-waiting first for what's open (that's the queue); newest first for history.
    Order.find(filter).sort(status === "open" || status === "placed" ? { createdAt: 1 } : { createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ orders: rows.map((o) => shapeOrder(o, { forOwner: true })), page, pages: Math.max(1, Math.ceil(total / limit)), total });
});

// GET /api/orders/:id
ordersRouter.get("/:id", async (req, res) => {
  const o = await load(req, res);
  if (!o) return;
  const sale = o.saleId ? await Sale.findById(o.saleId).select("status") : null;
  res.json({ order: { ...shapeOrder(o, { forOwner: true }), saleStatus: sale?.status || null } });
});

// POST /api/orders/:id/confirm — accept it; this is what records the sale
ordersRouter.post("/:id/confirm", async (req, res) => {
  const o = await load(req, res);
  if (!o) return;
  if (o.status !== "placed") return res.status(409).json({ error: "order_handled", message: "This order has already been handled." });
  try {
    const updated = await confirmOrder(req.ctx, o);
    tellCustomer(req.ctx.business, updated);
    res.json({ order: shapeOrder(updated, { forOwner: true }) });
  } catch (err) { reply(res, err); }
});

const reasonSchema = z.object({ reason: z.string().trim().min(3, "Tell the customer why (a few words is fine)").max(200) });

// POST /api/orders/:id/reject { reason }
ordersRouter.post("/:id/reject", async (req, res) => {
  const parsed = reasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const o = await load(req, res);
  if (!o) return;
  try {
    const updated = await rejectOrder(req.ctx, o, parsed.data.reason);
    tellCustomer(req.ctx.business, updated, `Reason: ${parsed.data.reason}`);
    res.json({ order: shapeOrder(updated, { forOwner: true }) });
  } catch (err) { reply(res, err); }
});

// POST /api/orders/:id/status { status } — ready / out_for_delivery / completed
ordersRouter.post("/:id/status", async (req, res) => {
  const parsed = z.object({ status: z.enum(["ready", "out_for_delivery", "completed"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: "Choose a valid status." });
  const o = await load(req, res);
  if (!o) return;
  try {
    const updated = await advanceOrder(req.ctx, o, parsed.data.status);
    tellCustomer(req.ctx.business, updated);
    res.json({ order: shapeOrder(updated, { forOwner: true }) });
  } catch (err) { reply(res, err); }
});

// POST /api/orders/:id/paid — the transfer landed
ordersRouter.post("/:id/paid", async (req, res) => {
  const o = await load(req, res);
  if (!o) return;
  try {
    res.json({ order: shapeOrder(await markPaid(req.ctx, o), { forOwner: true }) });
  } catch (err) { reply(res, err); }
});
