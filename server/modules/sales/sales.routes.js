import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Product } from "#modules/products/product.model.js";
import { Serial } from "#modules/businesses/electronics/serial.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Return } from "#modules/returns/return.model.js";
import { requirePerm, requireBranch, canSeeCost } from "#core/middleware/tenant.js";
import { applyMovement, InsufficientStockError } from "#modules/inventory/inventory.service.js";
import { nextSeq } from "#core/counters.js";
import { bumpDailyMetric, localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";
import { withTransaction } from "#core/tx.js";
import { HttpError, badRequest, conflict, notFound } from "#core/httpError.js";
import { afterStockChange } from "#modules/alerts/alerts.service.js";
import { hasCapability } from "#shared/businessTypes.js";

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
      ...(i.width ? { width: i.width, height: i.height, custom: true } : {}),
      ...(i.prepStatus ? { prepStatus: i.prepStatus } : {}),
      ...(showCost ? { lineCost: i.lineCost } : {}),
    })),
    subtotal: s.subtotal,
    discount: s.discount,
    vat: s.vat,
    total: s.total,
    payments: s.payments,
    tendered: s.tendered || 0,
    change: s.change || 0,
    status: s.status,
    voidInfo: s.status === "voided" ? { byName: s.voidInfo?.byName, reason: s.voidInfo?.reason, at: s.voidInfo?.at } : undefined,
  };
}

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string(),
        qty: z.number().int().positive(),
        // Made-to-order lines carry the order's dimensions (meters) and may
        // carry a negotiated price per item.
        width: z.number().positive().max(100).optional(),
        height: z.number().positive().max(100).optional(),
        price: z.number().min(0).optional(),
        // Optional: specific in-stock units for a tracksSerials product.
        // Omit it and the sale still goes through — serial capture never
        // blocks a checkout, it just leaves the units unassigned.
        serialNos: z.array(z.string().min(1)).optional(),
      })
    )
    .min(1, "The cart is empty"),
  discount: z.number().min(0).default(0),
  payments: z
    .array(z.object({ method: z.enum(["cash", "pos", "transfer"]), amount: z.number().min(0) }))
    .min(1, "Choose a payment method")
    .max(3, "At most one entry per payment method"),
  
  tendered: z.number().min(0).optional(),
  customerId: z.string().optional(),
  customer: z.object({ name: z.string().min(1), phone: z.string().default("") }).optional(),
  clientSaleId: z.string().optional(), // offline-queue idempotency
});


salesRouter.post("/", requirePerm("sales"), requireBranch, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  const settings = req.ctx.business.settings;

  try {
    const out = await withTransaction(async (session) => {
      // Idempotent replay: the offline queue can safely retry.
      if (d.clientSaleId) {
        const existing = await Sale.findOne({
          businessId: req.ctx.businessId,
          clientSaleId: d.clientSaleId,
        }).session(session);
        if (existing) return { replayed: true, sale: existing };
      }

      const products = await Product.find({
        _id: { $in: [...new Set(d.items.map((i) => i.productId))] },
        businessId: req.ctx.businessId,
        status: "active",
      }).session(session);
      const byId = new Map(products.map((p) => [String(p._id), p]));
      for (const item of d.items) {
        if (!byId.has(item.productId)) throw badRequest("One of the products no longer exists.");
      }

      // Split: stock lines merge by product; made-to-order lines stay separate
      // (each carries its own dimensions and price).
      const qtyByProduct = new Map();
      const mtoItems = [];
      const serialsByProduct = new Map();
      for (const item of d.items) {
        const p = byId.get(item.productId);
        if (p.archetype === "made_to_order") mtoItems.push(item);
        else qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.qty);
        if (item.serialNos?.length) {
          const arr = serialsByProduct.get(item.productId) || [];
          serialsByProduct.set(item.productId, [...arr, ...item.serialNos]);
        }
      }

      // Server-side pricing and totals — stock lines.
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
          components: [],
        };
      });

      // Made-to-order lines: quantity of each component comes from the
      // business's own recipe (per m² / per m width / per m height / per item).
      if (mtoItems.length) {
        const compIds = new Set();
        for (const item of mtoItems) {
          for (const c of byId.get(item.productId).bom || []) compIds.add(String(c.productId));
        }
        const compProducts = await Product.find({ _id: { $in: [...compIds] }, businessId: req.ctx.businessId }).session(session);
        const compById = new Map(compProducts.map((p) => [String(p._id), p]));
        const round3 = (n) => Math.round(n * 1000) / 1000;

        for (const item of mtoItems) {
          const p = byId.get(item.productId);
          if (!p.bom?.length) {
            throw badRequest(`${p.name} has no components configured — set them up on the product first.`);
          }
          // Dimensions only matter to a recipe that actually scales by area or
          // a side (blinds, priced per m²). A plain "unit" recipe — a bowl of
          // jollof made from rice/chicken/tomato — needs none: default both to
          // 1 so the pricing formula below collapses to the item's own price.
          const needsDims = p.bom.some((c) => c.per !== "unit");
          if (needsDims && (!item.width || !item.height)) throw badRequest(`${p.name} needs width and height.`);
          const w = needsDims ? item.width : 1;
          const h = needsDims ? item.height : 1;
          const components = [];
          let lineCost = 0;
          for (const c of p.bom) {
            const comp = compById.get(String(c.productId));
            if (!comp) throw badRequest(`A component of ${p.name} no longer exists.`);
            const base =
              c.per === "sqm" ? w * h :
              c.per === "width" ? w :
              c.per === "height" ? h : 1;
            const qtyNeeded = round3(base * (c.factor || 1) * item.qty);
            if (qtyNeeded > 0) {
              components.push({ productId: comp._id, name: comp.name, qty: qtyNeeded });
              lineCost += (comp.cost || 0) * qtyNeeded;
            }
          }
          const unitPrice = item.price !== undefined ? money(item.price) : money(p.price * w * h);
          lines.push({
            productId: p._id,
            name: needsDims ? `${p.name} — ${w}m × ${h}m` : p.name,
            qty: item.qty,
            unitPrice,
            lineCost: money(lineCost),
            lineNet: money(unitPrice * item.qty),
            returnedQty: 0,
            ...(needsDims ? { width: w, height: h } : {}),
            components,
          });
        }
      }

      // Serial-tracked stock: validate any units the cashier picked BEFORE
      // anything moves — same "cheap failures first" ordering as the customer
      // resolution below. Optional: a line with no serialNos just sells normally.
      const serialUpdates = [];
      if (serialsByProduct.size) {
        for (const line of lines) {
          if (line.components.length) continue; // made-to-order lines don't carry serials
          const given = serialsByProduct.get(String(line.productId));
          if (!given?.length) continue;
          if (given.length !== line.qty) {
            throw badRequest(`${line.name}: chose ${given.length} serial number(s) for a quantity of ${line.qty}.`);
          }
          const found = await Serial.find({
            businessId: req.ctx.businessId, productId: line.productId, serialNo: { $in: given }, status: "in_stock",
          }).session(session);
          if (found.length !== given.length) {
            const foundNos = new Set(found.map((s) => s.serialNo));
            const missing = given.find((s) => !foundNos.has(s));
            throw badRequest(`${missing} isn't an available serial number for ${line.name}.`);
          }
          serialUpdates.push(...found);
        }
      }

      const subtotal = money(lines.reduce((s, l) => s + l.lineNet, 0));
      const discount = money(Math.min(d.discount, subtotal));
      const vat = settings.vatEnabled ? money(((subtotal - discount) * settings.vatRate) / 100) : 0;
      const total = money(subtotal - discount + vat);

      // Split tender: one entry per method, and they must add up to the total.
      const methodsSeen = new Set();
      for (const p of d.payments) {
        if (methodsSeen.has(p.method)) throw badRequest(`${p.method} appears twice — combine it into one amount.`);
        methodsSeen.add(p.method);
      }
      const paid = money(d.payments.reduce((s, p) => s + p.amount, 0));
      if (Math.abs(paid - total) > 0.01) {
        throw badRequest(`Payments (${paid}) don't add up to the total (${total}).`, "payment_mismatch");
      }

      // Change is only ever cash, and only against the cash portion.
      const cashDue = d.payments.find((p) => p.method === "cash")?.amount || 0;
      const tendered = d.tendered ? money(d.tendered) : 0;
      if (tendered && tendered < cashDue - 0.01) {
        throw badRequest(`Cash tendered (${tendered}) is less than the cash due (${cashDue}).`, "short_tender");
      }
      const change = tendered ? money(tendered - cashDue) : 0;

      // Resolve the customer before moving stock (cheap to fail early).
      let customer = null;
      if (d.customerId) {
        customer = await Customer.findOne({ _id: d.customerId, businessId: req.ctx.businessId }).session(session);
        if (!customer) throw badRequest("That customer doesn't exist.");
      } else if (d.customer?.name) {
        customer =
          (d.customer.phone &&
            (await Customer.findOne({ businessId: req.ctx.businessId, phone: d.customer.phone }).session(session))) ||
          (
            await Customer.create(
              [{
                accountId: req.ctx.accountId,
                businessId: req.ctx.businessId,
                name: d.customer.name,
                phone: d.customer.phone,
                whatsapp: d.customer.phone,
              }],
              { session }
            )
          )[0];
      }

      // Mint the sale id up front so every movement points at it from birth.
      const saleId = new mongoose.Types.ObjectId();

      // Flatten every deduction: stock lines move themselves; made-to-order
      // lines move their components instead (the blind itself has no stock).
      const deductions = [];
      for (const line of lines) {
        if (line.components.length) {
          for (const c of line.components) {
            deductions.push({ productId: c.productId, name: c.name, qty: c.qty, reason: `Used for ${line.name}` });
          }
        } else {
          deductions.push({ productId: line.productId, name: line.name, qty: line.qty, reason: "Sale" });
        }
      }

      // Inside a transaction an abort undoes every movement for us. Without
      // one (standalone MongoDB) we walk the applied movements back by hand.
      const moved = [];
      try {
        for (const ded of deductions) {
          await applyMovement(req.ctx, {
            branchId: req.ctx.branchId,
            productId: ded.productId,
            productName: ded.name,
            type: "OUT",
            qty: -ded.qty,
            refType: "sale",
            refId: saleId,
            reason: ded.reason,
            session,
          });
          moved.push(ded);
        }
      } catch (err) {
        if (!session) {
          for (const ded of moved.reverse()) {
            await applyMovement(req.ctx, {
              branchId: req.ctx.branchId, productId: ded.productId, productName: ded.name,
              type: "IN", qty: ded.qty, refType: "sale", reason: "Checkout rollback",
            }).catch((e) => console.error("checkout rollback failed:", ded.name, e.message));
          }
        }
        throw err;
      }

      const seq = await nextSeq(`sale:${req.ctx.branchId}`, session);
      const saleNo = `R-${String(seq).padStart(5, "0")}`;

      // A restaurant sale routes each line to the kitchen queue; every other
      // business type's items never get a prep status at all.
      const itemsOut = hasCapability(req.ctx.business.typeKey, "kitchenQueue")
        ? lines.map((l) => ({ ...l, prepStatus: "pending" }))
        : lines;

      const [sale] = await Sale.create(
        [{
          _id: saleId,
          accountId: req.ctx.accountId,
          businessId: req.ctx.businessId,
          branchId: req.ctx.branchId,
          saleNo,
          staffId: req.ctx.userId,
          staffName: req.ctx.actorName,
          customerId: customer?._id,
          customerName: customer?.name || "",
          items: itemsOut,
          subtotal,
          discount,
          vat,
          total,
          payments: d.payments.map((p) => ({ method: p.method, amount: money(p.amount) })),
          tendered,
          change,
          clientSaleId: d.clientSaleId,
        }],
        { session }
      );

      if (customer) {
        customer.totalSpend = money(customer.totalSpend + total);
        customer.visits += 1;
        customer.lastSeen = new Date();
        customer.lastBranchId = req.ctx.branchId;
        // Loyalty tokens (water): only sachet/bag lines earn them, per the
        // trade's own rule — bottles and everything else are sold, just not
        // counted toward a free pack.
        if (hasCapability(req.ctx.business.typeKey, "loyalty")) {
          const sachetBagQty = lines
            .filter((l) => /sachet|bag/i.test(l.name))
            .reduce((s, l) => s + l.qty, 0);
          if (sachetBagQty > 0) customer.sachetBagQty = (customer.sachetBagQty || 0) + sachetBagQty;
        }
        await customer.save({ session });
      }

      for (const serial of serialUpdates) {
        serial.status = "sold";
        serial.saleId = saleId;
        serial.customerId = customer?._id || null;
        serial.customerName = customer?.name || "";
        serial.soldAt = new Date();
        const warrantyMonths = byId.get(String(serial.productId))?.warrantyMonths || 0;
        if (warrantyMonths > 0) {
          const expires = new Date(serial.soldAt);
          expires.setMonth(expires.getMonth() + warrantyMonths);
          serial.warrantyExpiresAt = expires;
        }
        await serial.save({ session });
      }

      const totalCost = money(lines.reduce((s, l) => s + l.lineCost, 0));
      const payments = {};
      for (const p of d.payments) payments[p.method] = (payments[p.method] || 0) + p.amount;
      await bumpDailyMetric(
        req.ctx,
        req.ctx.branchId,
        localDay(),
        {
          revenue: total,
          cost: totalCost,
          profit: total - vat - totalCost,
          txns: 1,
          discountTotal: discount,
          vatTotal: vat,
          payments,
        },
        session
      );

      return {
        sale, customer, lines, subtotal, discount, vat, total, saleNo, tendered, change,
        deductedIds: deductions.map((d) => d.productId),
      };
    });

    if (out.replayed) {
      return res.status(200).json({ sale: shapeSale(out.sale, canSeeCost(req.ctx)), replayed: true });
    }

    
    afterStockChange(req.ctx, req.ctx.branchId, out.deductedIds);

    res.status(201).json({
      sale: shapeSale(out.sale, canSeeCost(req.ctx)),
      receipt: {
        saleNo: out.saleNo,
        businessName: req.ctx.business.name,
        at: out.sale.at,
        staffName: out.sale.staffName,
        customerName: out.sale.customerName,
        customerPhone: out.customer?.whatsapp || out.customer?.phone || "",
        items: out.lines.map((l) => ({ name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineNet: l.lineNet })),
        subtotal: out.subtotal,
        discount: out.discount,
        vat: out.vat,
        total: out.total,
        payments: out.sale.payments,
        tendered: out.tendered,
        change: out.change,
        footer: settings.receiptFooter,
        currency: settings.currency,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof InsufficientStockError) return res.status(409).json({ error: err.code, message: err.message });
    throw err;
  }
});


function buildSalesFilter(req) {
  const filter = { businessId: req.ctx.businessId, branchId: req.ctx.branchId };
  const canSeeAll = req.ctx.perms.includes("*") || req.ctx.perms.includes("dashboard_ops");
  if (req.query.mine === "1" || !canSeeAll) {
    // Staff see their own sales only.
    filter.staffId = req.ctx.userId;
  }
  if (req.query.staffId && mongoose.isValidObjectId(req.query.staffId)) {
    filter.staffId = new mongoose.Types.ObjectId(String(req.query.staffId));
  }
  if (req.query.status === "completed" || req.query.status === "voided") filter.status = req.query.status;
  if (req.query.saleNo) {
    filter.saleNo = { $regex: `${String(req.query.saleNo).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  }
  if (req.query.customerId && mongoose.isValidObjectId(req.query.customerId)) {
    filter.customerId = new mongoose.Types.ObjectId(String(req.query.customerId));
  }
  if (req.query.productId && mongoose.isValidObjectId(req.query.productId)) {
    filter["items.productId"] = new mongoose.Types.ObjectId(String(req.query.productId));
  }
  if (req.query.method) filter["payments.method"] = String(req.query.method);
  const min = Number(req.query.minTotal);
  const max = Number(req.query.maxTotal);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.total = {};
    if (Number.isFinite(min)) filter.total.$gte = min;
    if (Number.isFinite(max)) filter.total.$lte = max;
  }
  if (req.query.date) {
    const day = new Date(`${req.query.date}T00:00:00`);
    filter.at = { $gte: day, $lt: new Date(day.getTime() + 24 * 3600 * 1000) };
  } else if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = new Date(`${req.query.from}T00:00:00`);
    if (req.query.to) filter.at.$lt = new Date(new Date(`${req.query.to}T00:00:00`).getTime() + 24 * 3600 * 1000);
  }
  return filter;
}

// GET /api/sales — branch sales history, paged.
// Filters: date | from&to | staffId | customerId | productId | method |
//          minTotal&maxTotal | status | saleNo | mine=1
salesRouter.get("/", requirePerm("sales", "dashboard_ops"), requireBranch, async (req, res) => {
  const filter = buildSalesFilter(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const page = Math.max(Number(req.query.page) || 1, 1);

  // Totals come from an aggregation over the WHOLE filter, not the page —
  // a summary bar that only added up the first 50 rows would quietly
  // understate every busy day.
  const [sales, [agg]] = await Promise.all([
    Sale.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit),
    Sale.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
          revenue: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$total", 0] } },
          discount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$discount", 0] } },
          vat: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$vat", 0] } },
        },
      },
    ]),
  ]);

  const count = agg?.count || 0;
  const revenue = money(agg?.revenue || 0);

  
  const dateOnly = !filter.staffId && !filter.saleNo && !filter.customerId &&
    !filter["items.productId"] && !filter["payments.method"] && !filter.total && !filter.status;

  let refunds = null;
  if (dateOnly) {
    const returnFilter = {
      businessId: req.ctx.businessId,
      branchId: req.ctx.branchId,
      status: "approved",
      ...(filter.at ? { decidedAt: filter.at } : {}),
    };
    const [r] = await Return.aggregate([
      { $match: returnFilter },
      { $group: { _id: null, amount: { $sum: "$refund.amount" }, n: { $sum: 1 } } },
    ]);
    refunds = { amount: money(r?.amount || 0), count: r?.n || 0 };
  }

  res.json({
    sales: sales.map((s) => shapeSale(s, canSeeCost(req.ctx))),
    page,
    pages: Math.max(1, Math.ceil(count / limit)),
    totals: {
      count,
      completed: agg?.completed || 0,
      voided: count - (agg?.completed || 0),
      revenue,
      discount: money(agg?.discount || 0),
      vat: money(agg?.vat || 0),
      refunds: refunds?.amount ?? null,
      refundCount: refunds?.count ?? null,
      // What the business actually kept — the figure the dashboard shows.
      net: refunds ? money(revenue - refunds.amount) : null,
    },
  });
});

// GET /api/sales/:id — one sale (receipt reprint, return submission)
salesRouter.get("/:id", requirePerm("sales", "dashboard_ops"), async (req, res) => {
  const sale = await Sale.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!sale) return res.status(404).json({ error: "not_found", message: "Sale not found." });
  res.json({ sale: shapeSale(sale, canSeeCost(req.ctx)) });
});


salesRouter.post("/:id/void", requirePerm("void_sales"), async (req, res) => {
  const reason = String(req.body?.reason || "").trim();
  if (reason.length < 3) return res.status(400).json({ error: "invalid", message: "Give a reason for voiding this sale." });

  try {
    const sale = await withTransaction(async (session) => {
      const sale = await Sale.findOne({ _id: req.params.id, businessId: req.ctx.businessId }).session(session);
      if (!sale) throw notFound("Sale not found.");
      if (sale.status === "voided") throw conflict("This sale is already voided.", "already_voided");
      if (sale.items.some((i) => i.returnedQty > 0)) {
        throw conflict("This sale has returns — void isn't possible.", "has_returns");
      }

      for (const line of sale.items) {
        if (line.components?.length) {
          // Made-to-order: the components come back, not the custom item.
          for (const c of line.components) {
            await applyMovement(req.ctx, {
              branchId: sale.branchId, productId: c.productId, productName: c.name,
              type: "VOID_RESTOCK", qty: c.qty, refType: "sale", refId: sale._id,
              reason: `Void ${sale.saleNo} (${line.name})`, session,
            });
          }
        } else {
          await applyMovement(req.ctx, {
            branchId: sale.branchId,
            productId: line.productId,
            productName: line.name,
            type: "VOID_RESTOCK",
            qty: line.qty,
            refType: "sale",
            refId: sale._id,
            reason: `Void ${sale.saleNo}`,
            session,
          });
        }
      }

      sale.status = "voided";
      sale.voidInfo = { by: req.ctx.userId, byName: req.ctx.actorName, reason, at: new Date() };
      await sale.save({ session });

      if (sale.customerId) {
        const customer = await Customer.findById(sale.customerId).session(session);
        if (customer) {
          customer.totalSpend = money(Math.max(0, customer.totalSpend - sale.total));
          customer.visits = Math.max(0, customer.visits - 1);
          await customer.save({ session });
          // A credit sale that gets voided never happened — the customer
          // shouldn't be left owing money for it.
          const creditPaid = sale.payments.find((p) => p.method === "credit");
          if (creditPaid) {
            const { applyCreditChange } = await import("#modules/customers/customerLedger.model.js");
            await applyCreditChange(req.ctx, {
              customer, type: "adjustment", amount: -creditPaid.amount,
              refType: "void", refId: sale._id, note: `Void ${sale.saleNo}`, session,
            });
          }
        }
      }

      const totalCost = money(sale.items.reduce((s, l) => s + l.lineCost, 0));
      const payments = {};
      for (const p of sale.payments) payments[p.method] = (payments[p.method] || 0) - p.amount;
      await bumpDailyMetric(
        req.ctx,
        sale.branchId,
        localDay(sale.at),
        {
          revenue: -sale.total,
          cost: -totalCost,
          profit: -(sale.total - sale.vat - totalCost),
          txns: -1,
          discountTotal: -sale.discount,
          vatTotal: -sale.vat,
          payments,
        },
        session
      );

      return sale;
    });

    // Stock came back — anything that was flagged low may now be fine.
    afterStockChange(req.ctx, sale.branchId, sale.items.flatMap((l) =>
      l.components?.length ? l.components.map((c) => c.productId) : [l.productId]
    ));

    audit(req.ctx, "sale.void", { type: "sale", id: sale._id, label: sale.saleNo }, { total: sale.total }, { reason });
    res.json({ sale: shapeSale(sale, canSeeCost(req.ctx)) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }
});
