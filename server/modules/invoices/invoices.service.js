import crypto from "node:crypto";
import mongoose from "mongoose";
import { publicBase } from "#core/share.js";
import { Invoice } from "#modules/invoices/invoice.model.js";
import { Product } from "#modules/products/product.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { applyCreditChange } from "#modules/customers/customerLedger.model.js";
import { customerRoom } from "#modules/customers/customerLimit.js";
import { bumpDailyMetric, localDay } from "#modules/metrics/metrics.service.js";
import { afterStockChange } from "#modules/alerts/alerts.service.js";
import { nextSeq } from "#core/counters.js";
import { withTransaction } from "#core/tx.js";
import { badRequest, conflict } from "#core/httpError.js";
import { scopedToBranch, ownerBranchForNew } from "#core/branchScope.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";

/**
 * Everything an invoice does to the books, in one place.
 *
 *  issue    stock leaves, the sale is recorded as OWED (a "credit" payment), the
 *           customer's balance goes up
 *  pay      the invoice's balance and the customer's balance come down, and the
 *           day's cash split records what was collected
 *  void     all of the above is undone, and the stock goes back
 *
 * Each is one transaction, so an invoice can never be half-issued or half-voided.
 */

const DAY = 86_400_000;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const digits = (v) => String(v ?? "").replace(/\D/g, "");

export const isOverdue = (inv, now = new Date()) =>
  ["issued", "partial"].includes(inv.status) && !!inv.dueDate && inv.balance > 0.005 && endOfDay(inv.dueDate) < now;

/** The state a person sees: "overdue" is worked out, not stored. */
export const displayStatus = (inv, now) => (isOverdue(inv, now) ? "overdue" : inv.status);

// ── pricing ─────────────────────────────────────────────────────────────────

/**
 * Turns what the form sent into trusted lines and totals. Catalog lines take their
 * name from the catalog (the price may be changed: invoices are often negotiated);
 * custom lines carry their own name and price. Nothing about money is believed from
 * the browser except the unit price the owner chose.
 */
export async function priceInvoice(ctx, input) {
  const settings = ctx.business.settings || {};
  const wanted = input.items || [];
  const ids = [...new Set(wanted.map((i) => i.productId).filter(Boolean))];
  const catalog = ids.length
    ? await Product.find(scopedToBranch(ctx, { _id: { $in: ids }, businessId: ctx.businessId, status: "active", archetype: "stock" })).select("name price")
    : [];
  const by = new Map(catalog.map((p) => [String(p._id), p]));

  const items = [];
  for (const i of wanted) {
    const qty = Math.round(Number(i.qty) * 1000) / 1000;
    if (!(qty > 0)) throw badRequest("Every line needs a quantity above zero.");
    if (i.productId) {
      const p = by.get(String(i.productId));
      if (!p) throw badRequest("One of those products isn't in your catalog, or is made to order (use a custom line for that).");
      const unitPrice = money(i.unitPrice ?? p.price);
      items.push({ productId: p._id, name: p.name, description: String(i.description || "").trim().slice(0, 200), qty, unitPrice, lineNet: money(qty * unitPrice) });
    } else {
      const name = String(i.name || "").trim().slice(0, 140);
      if (!name) throw badRequest("Give each custom line a description.");
      if (i.unitPrice === undefined || !(Number(i.unitPrice) >= 0)) throw badRequest(`"${name}" needs a price.`);
      const unitPrice = money(i.unitPrice);
      items.push({ productId: null, name, description: String(i.description || "").trim().slice(0, 200), qty, unitPrice, lineNet: money(qty * unitPrice) });
    }
  }
  if (!items.length) throw badRequest("Add at least one line.");

  const subtotal = money(items.reduce((t, l) => t + l.lineNet, 0));
  let discount = input.discountPct !== undefined ? money((subtotal * Number(input.discountPct)) / 100) : money(input.discount || 0);
  discount = Math.min(Math.max(discount, 0), subtotal);
  const vatRate = input.applyVat && settings.vatEnabled ? Number(settings.vatRate) || 0 : 0;
  const vat = vatRate ? money(((subtotal - discount) * vatRate) / 100) : 0;
  return { items, subtotal, discount, vatRate, vat, total: money(subtotal - discount + vat) };
}

export function dueDateFor(ctx, issueDate) {
  const days = ctx.business.settings?.invoice?.dueDays ?? 14;
  return new Date(new Date(issueDate).getTime() + days * DAY);
}

// ── customers ───────────────────────────────────────────────────────────────

/** The customer an invoice is for: the one picked, a match by phone, or a new one (if the plan has room). */
async function resolveCustomer(ctx, inv, session) {
  if (inv.customerId) return Customer.findOne({ _id: inv.customerId, businessId: ctx.businessId }).session(session);
  const c = inv.customer || {};
  if (!c.name) return null;
  const t = digits(c.phone).slice(-10);
  const known = t.length >= 7 ? await Customer.findOne({ businessId: ctx.businessId, phone: { $regex: `${t}$` } }).session(session) : null;
  if (known) return known;
  if ((await customerRoom(ctx.businessId, ctx.plan, session)).remaining <= 0) return null; // the plan's limit: the invoice still goes out
  const [made] = await Customer.create([{
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: await ownerBranchForNew(ctx), name: c.name, phone: c.phone || "", whatsapp: c.phone || "", email: c.email || "", address: c.address || "",
  }], { session });
  return made;
}

/** Custom lines (services, fees) need something for the sale to point at: an archived item per name, never on the till. */
async function serviceItem(ctx, name, session) {
  const found = await Product.findOne({ businessId: ctx.businessId, serviceItem: true, name }).session(session);
  if (found) return found;
  const [made] = await Product.create([{ accountId: ctx.accountId, businessId: ctx.businessId, branchId: null, name, price: 0, cost: 0, category: "Services", status: "archived", serviceItem: true }], { session });
  return made;
}

// ── issue ───────────────────────────────────────────────────────────────────

export async function issueInvoice(ctx, invoiceId) {
  let stockedIds = [];
  const result = await withTransaction(async (session) => {
    const inv = await Invoice.findOne({ _id: invoiceId, businessId: ctx.businessId }).session(session);
    if (!inv) throw conflict("Invoice not found.", "not_found");
    if (inv.status !== "draft") throw conflict("This invoice has already been issued.", "already_issued");
    if (!inv.items.length) throw badRequest("Add at least one line before issuing.");
    if (!(inv.total > 0)) throw badRequest("An invoice needs a total above zero.");
    const cx = { ...ctx, branchId: inv.branchId }; // stock comes from the store the invoice was made in

    const customer = await resolveCustomer(cx, inv, session);

    // Stock: one movement per catalog product, however many lines it appears on.
    const qtyBy = new Map();
    for (const l of inv.items) if (l.productId) qtyBy.set(String(l.productId), (qtyBy.get(String(l.productId)) || 0) + l.qty);
    const products = await Product.find({ _id: { $in: [...qtyBy.keys()].map(oid) }, businessId: ctx.businessId }).session(session);
    const productBy = new Map(products.map((p) => [String(p._id), p]));
    for (const [pid, qty] of qtyBy) {
      const p = productBy.get(pid);
      if (!p || p.status !== "active") throw badRequest("One of the products on this invoice is no longer in your catalog.");
    }
    const saleId = new mongoose.Types.ObjectId();
    const invNo = `INV-${String(await nextSeq(`invoice:${ctx.businessId}`, session)).padStart(4, "0")}`;
    for (const [pid, qty] of qtyBy) {
      await applyMovement(cx, { branchId: inv.branchId, productId: oid(pid), productName: productBy.get(pid).name, type: "OUT", qty: -qty, refType: "invoice", refId: inv._id, reason: `Invoice ${invNo}`, session });
    }
    stockedIds = [...qtyBy.keys()].map(oid);

    // The sale: recorded now, owed until paid.
    const saleItems = [];
    for (const l of inv.items) {
      if (l.productId) {
        const p = productBy.get(String(l.productId));
        saleItems.push({ productId: p._id, name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineCost: money((p.cost || 0) * l.qty), lineNet: l.lineNet, returnedQty: 0, components: [] });
      } else {
        const s = await serviceItem(cx, l.name, session);
        saleItems.push({ productId: s._id, name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineCost: 0, lineNet: l.lineNet, returnedQty: 0, components: [] });
      }
    }
    const totalCost = money(saleItems.reduce((t, i) => t + i.lineCost, 0));
    const at = inv.issueDate && inv.issueDate < new Date() ? inv.issueDate : new Date();
    await Sale.create([{
      _id: saleId, accountId: ctx.accountId, businessId: ctx.businessId, branchId: inv.branchId, saleNo: invNo, at, staffId: ctx.userId, staffName: ctx.actorName,
      customerId: customer?._id, customerName: customer?.name || inv.customer?.name || "", items: saleItems,
      subtotal: inv.subtotal, discount: inv.discount, vat: inv.vat, total: inv.total, payments: [{ method: "credit", amount: inv.total }],
      status: "completed", channel: "invoice", invoiceId: inv._id,
    }], { session });
    await bumpDailyMetric(cx, inv.branchId, localDay(at), { revenue: inv.total, cost: totalCost, profit: inv.total - inv.vat - totalCost, txns: 1, discountTotal: inv.discount, vatTotal: inv.vat }, session);

    if (customer) {
      customer.totalSpend = money(customer.totalSpend + inv.total);
      customer.visits += 1;
      customer.lastSeen = new Date();
      await applyCreditChange(cx, { customer, type: "sale", amount: inv.total, refType: "invoice", refId: inv._id, note: invNo, session }); // also saves the customer
      inv.customerId = customer._id;
      inv.customer = { name: inv.customer?.name || customer.name, phone: inv.customer?.phone || customer.phone || "", email: inv.customer?.email || customer.email || "", address: inv.customer?.address || customer.address || "" };
    }

    inv.invoiceNo = invNo;
    inv.status = "issued";
    inv.saleId = saleId;
    inv.amountPaid = 0;
    inv.balance = inv.total;
    inv.shareToken = crypto.randomBytes(16).toString("hex");
    if (!inv.dueDate) inv.dueDate = dueDateFor(ctx, inv.issueDate || at);
    await inv.save({ session });
    return inv;
  });
  afterStockChange({ ...ctx, branchId: result.branchId }, result.branchId, stockedIds);
  audit(ctx, "invoice.issue", { type: "invoice", id: result._id, label: result.invoiceNo }, undefined, { total: result.total });
  return result;
}

// ── payments ────────────────────────────────────────────────────────────────

export async function recordPayment(ctx, invoiceId, { method, amount, at, note }) {
  const result = await withTransaction(async (session) => {
    const inv = await Invoice.findOne({ _id: invoiceId, businessId: ctx.businessId }).session(session);
    if (!inv) throw conflict("Invoice not found.", "not_found");
    if (!["issued", "partial"].includes(inv.status)) throw conflict(inv.status === "paid" ? "This invoice is already fully paid." : `This invoice is ${inv.status}; it can't take payments.`, "not_payable");
    amount = money(amount);
    if (!(amount > 0)) throw badRequest("Enter an amount above zero.");
    if (amount > inv.balance + 0.005) throw badRequest(`That's more than the ${inv.balance} still owed.`, "overpayment");
    const when = at && new Date(at) < new Date() ? new Date(at) : new Date();
    inv.payments.push({ method, amount, at: when, by: ctx.actorName, note: note || "" });
    inv.amountPaid = money(inv.payments.reduce((t, p) => t + p.amount, 0));
    inv.balance = money(Math.max(0, inv.total - inv.amountPaid));
    inv.status = inv.balance <= 0.005 ? "paid" : "partial";
    if (inv.status === "paid") inv.balance = 0;
    await inv.save({ session });

    if (inv.customerId) {
      const customer = await Customer.findById(inv.customerId).session(session);
      if (customer) await applyCreditChange({ ...ctx, branchId: inv.branchId }, { customer, type: "payment", amount: -amount, method, refType: "invoice", refId: inv._id, note: `${inv.invoiceNo}${note ? ` · ${note}` : ""}`, session });
    }
    // Money collected shows in the day's cash split; it isn't revenue again (that was booked at issue).
    await bumpDailyMetric({ ...ctx, branchId: inv.branchId }, inv.branchId, localDay(when), { payments: { [method]: amount } }, session);
    return inv;
  });
  audit(ctx, "invoice.payment", { type: "invoice", id: result._id, label: result.invoiceNo }, undefined, { amount, method });
  return result;
}

export async function removePayment(ctx, invoiceId, paymentId) {
  const result = await withTransaction(async (session) => {
    const inv = await Invoice.findOne({ _id: invoiceId, businessId: ctx.businessId }).session(session);
    if (!inv) throw conflict("Invoice not found.", "not_found");
    if (inv.status === "void") throw conflict("This invoice is void.", "void");
    const p = inv.payments.id(paymentId);
    if (!p) throw conflict("That payment doesn't exist.", "not_found");
    const { amount, method, at } = p;
    p.deleteOne();
    inv.amountPaid = money(inv.payments.reduce((t, x) => t + x.amount, 0));
    inv.balance = money(inv.total - inv.amountPaid);
    inv.status = inv.amountPaid > 0.005 ? "partial" : "issued";
    await inv.save({ session });
    if (inv.customerId) {
      const customer = await Customer.findById(inv.customerId).session(session);
      if (customer) await applyCreditChange({ ...ctx, branchId: inv.branchId }, { customer, type: "adjustment", amount, refType: "invoice", refId: inv._id, note: `${inv.invoiceNo}: payment removed`, session });
    }
    await bumpDailyMetric({ ...ctx, branchId: inv.branchId }, inv.branchId, localDay(at), { payments: { [method]: -amount } }, session);
    return inv;
  });
  audit(ctx, "invoice.payment_removed", { type: "invoice", id: result._id, label: result.invoiceNo });
  return result;
}

// ── void ────────────────────────────────────────────────────────────────────

export async function voidInvoice(ctx, invoiceId, reason) {
  let stockedIds = [];
  const result = await withTransaction(async (session) => {
    const inv = await Invoice.findOne({ _id: invoiceId, businessId: ctx.businessId }).session(session);
    if (!inv) throw conflict("Invoice not found.", "not_found");
    if (inv.status === "void") throw conflict("This invoice is already void.", "already_void");
    if (inv.status === "draft") throw conflict("A draft was never issued. Delete it instead.", "draft");
    const cx = { ...ctx, branchId: inv.branchId };
    const sale = await Sale.findById(inv.saleId).session(session);

    // Stock back on the shelf.
    const qtyBy = new Map();
    for (const l of inv.items) if (l.productId) qtyBy.set(String(l.productId), (qtyBy.get(String(l.productId)) || 0) + l.qty);
    for (const [pid, qty] of qtyBy) {
      const p = await Product.findById(pid).select("name").session(session);
      await applyMovement(cx, { branchId: inv.branchId, productId: oid(pid), productName: p?.name || "", type: "VOID_RESTOCK", qty, refType: "invoice_void", refId: inv._id, reason: `Void ${inv.invoiceNo}: ${reason}`, session });
    }
    stockedIds = [...qtyBy.keys()].map(oid);

    // The sale never happened: take its revenue, cost and the cash collected out of the day's figures.
    if (sale && sale.status !== "voided") {
      const cost = money(sale.items.reduce((t, i) => t + (i.lineCost || 0), 0));
      await bumpDailyMetric(cx, inv.branchId, localDay(sale.at), { revenue: -sale.total, cost: -cost, profit: -(sale.total - sale.vat - cost), txns: -1, discountTotal: -sale.discount, vatTotal: -sale.vat }, session);
      sale.status = "voided";
      sale.voidInfo = { by: ctx.userId, byName: ctx.actorName, reason, at: new Date() };
      await sale.save({ session });
    }
    for (const p of inv.payments) await bumpDailyMetric(cx, inv.branchId, localDay(p.at), { payments: { [p.method]: -p.amount } }, session);

    // The customer no longer owes it, and it no longer counts as something they bought.
    if (inv.customerId) {
      const customer = await Customer.findById(inv.customerId).session(session);
      if (customer) {
        customer.totalSpend = money(Math.max(0, customer.totalSpend - inv.total));
        customer.visits = Math.max(0, customer.visits - 1);
        // Payments already brought the balance down; what's left of it goes now.
        await applyCreditChange(cx, { customer, type: "adjustment", amount: -inv.balance, refType: "invoice_void", refId: inv._id, note: `${inv.invoiceNo} voided`, session });
      }
    }
    inv.status = "void";
    inv.voidInfo = { by: ctx.actorName, reason, at: new Date() };
    await inv.save({ session });
    return inv;
  });
  afterStockChange({ ...ctx, branchId: result.branchId }, result.branchId, stockedIds);
  audit(ctx, "invoice.void", { type: "invoice", id: result._id, label: result.invoiceNo }, undefined, { reason, hadPayments: result.amountPaid });
  return result;
}

// ── how an invoice is shown ─────────────────────────────────────────────────

export function shareUrl(req, inv) {
  return inv.shareToken ? `${publicBase(req)}/i/${inv.shareToken}` : "";
}

export function shape(inv, { url = "" } = {}) {
  const now = new Date();
  return {
    id: String(inv._id), invoiceNo: inv.invoiceNo || "", status: inv.status, displayStatus: displayStatus(inv, now), overdue: isOverdue(inv, now),
    daysOverdue: isOverdue(inv, now) ? Math.max(1, Math.floor((now - endOfDay(inv.dueDate)) / DAY) + 1) : 0,
    customerId: inv.customerId ? String(inv.customerId) : null, customer: inv.customer || {},
    items: inv.items.map((l) => ({ productId: l.productId ? String(l.productId) : null, name: l.name, description: l.description || "", qty: l.qty, unitPrice: l.unitPrice, lineNet: l.lineNet })),
    subtotal: inv.subtotal, discount: inv.discount, vatRate: inv.vatRate, vat: inv.vat, total: inv.total, amountPaid: inv.amountPaid, balance: inv.balance,
    issueDate: inv.issueDate, dueDate: inv.dueDate, notes: inv.notes, terms: inv.terms,
    payments: inv.payments.map((p) => ({ id: String(p._id), method: p.method, amount: p.amount, at: p.at, by: p.by, note: p.note })),
    sends: (inv.sends || []).map((s) => ({ via: s.via, kind: s.kind, to: s.to, at: s.at, by: s.by })),
    viewedAt: inv.viewedAt || null, viewCount: inv.viewCount || 0, shareUrl: url,
    voidInfo: inv.status === "void" ? { reason: inv.voidInfo?.reason, by: inv.voidInfo?.by, at: inv.voidInfo?.at } : undefined,
    createdBy: inv.createdBy, createdAt: inv.createdAt,
  };
}
