import mongoose from "mongoose";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { nextSeq } from "#core/counters.js";
import { bumpDailyMetric, localDay } from "#modules/metrics/metrics.service.js";
import { evaluateAndIssuePatronageCard } from "#modules/loyalty/loyaltyCard.service.js";
import { money } from "#core/money.js";
import { badRequest, conflict, notFound } from "#core/httpError.js";

/**
 * The money side shared by every service business (academy fees, salon
 * appointments, agency project payments).
 *
 * A service business has no stock, so none of this touches Inventory. What it
 * does keep identical to a shop is the books: every payment becomes an
 * ordinary Sale (so History, receipts, the Dashboard and the AI all see it)
 * and bumps the same DailyMetric. The Sale carries `service: { kind, refId }`
 * so the stock-based void/return flows know to leave it alone — a service
 * payment is reversed through its owning record, via reverseServicePayment().
 */

export const PAY_METHODS = ["cash", "pos", "transfer"];

/** Find an existing customer or create one — the same rule checkout uses. */
export async function resolveCustomer(ctx, { customerId, customer }, session = null) {
  if (customerId) {
    const found = await Customer.findOne({ _id: customerId, businessId: ctx.businessId }).session(session);
    if (!found) throw badRequest("That customer doesn't exist.");
    return found;
  }
  if (customer?.name?.trim()) {
    const phone = (customer.phone || "").trim();
    const existing = phone && (await Customer.findOne({ businessId: ctx.businessId, phone }).session(session));
    if (existing) return existing;
    const [created] = await Customer.create(
      [{ accountId: ctx.accountId, businessId: ctx.businessId, name: customer.name.trim(), phone, whatsapp: phone }],
      { session }
    );
    return created;
  }
  throw badRequest("Choose a customer or enter a name.");
}

/** Validates a split-tender list: known methods, one entry per method, > 0. */
export function cleanPayments(payments) {
  const seen = new Set();
  const out = [];
  for (const p of payments || []) {
    if (!PAY_METHODS.includes(p.method)) throw badRequest("Unknown payment method.");
    if (seen.has(p.method)) throw badRequest(`${p.method} appears twice — combine it into one amount.`);
    seen.add(p.method);
    const amount = money(p.amount);
    if (amount < 0) throw badRequest("A payment can't be negative.");
    if (amount > 0) out.push({ method: p.method, amount });
  }
  return out;
}

/**
 * Records money received for a service. Must run inside the caller's
 * transaction (pass its session) so the payment and the record it pays for
 * commit together.
 *
 *   countVisit — also count this as a customer visit (once per enrolment /
 *                appointment, never once per instalment)
 *
 * Returns { sale, payments } where `payments` is the cleaned list.
 */
export async function postServicePayment(ctx, {
  kind, refId, customer, label, payments, countVisit = false, at = new Date(), session = null,
}) {
  const clean = cleanPayments(payments);
  const amount = money(clean.reduce((s, p) => s + p.amount, 0));
  if (amount <= 0) throw badRequest("Enter an amount to receive.");

  const seq = await nextSeq(`sale:${ctx.branchId}`, session);
  const [sale] = await Sale.create(
    [{
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
      saleNo: `R-${String(seq).padStart(5, "0")}`, at,
      staffId: ctx.userId, staffName: ctx.actorName,
      customerId: customer._id, customerName: customer.name,
      items: [{
        productId: new mongoose.Types.ObjectId(), name: label,
        qty: 1, unitPrice: amount, lineCost: 0, lineNet: amount, returnedQty: 0,
      }],
      subtotal: amount, discount: 0, vat: 0, total: amount,
      payments: clean,
      service: { kind, refId },
    }],
    { session }
  );

  customer.totalSpend = money(customer.totalSpend + amount);
  customer.lastSeen = at;
  customer.lastBranchId = ctx.branchId;
  if (countVisit) customer.visits += 1;
  await customer.save({ session });

  // A patron who crosses the owner's loyalty threshold earns a card — same
  // rule, same gate as a shop checkout (sales.routes.js).
  if (countVisit && ctx.business) {
    const modules = ctx.business.settings?.modules;
    if (!modules || modules.includes("loyaltyCard")) {
      await evaluateAndIssuePatronageCard(ctx, customer, ctx.business, session);
    }
  }

  const split = {};
  for (const p of clean) split[p.method] = (split[p.method] || 0) + p.amount;
  // No cost of goods here, so revenue and profit move together; the tutor's
  // pay, rent etc. are Expenses and the dashboard subtracts them itself.
  await bumpDailyMetric(ctx, ctx.branchId, localDay(at), { revenue: amount, profit: amount, txns: 1, payments: split }, session);

  return { sale, payments: clean, amount };
}

/**
 * Takes a service payment back: the Sale is voided (kept and flagged, never
 * deleted), the day's metrics and the customer's spend are rolled back.
 * The caller reverses its own record (enrolment balance etc.) in the same
 * transaction.
 */
export async function reverseServicePayment(ctx, { saleId, kind, reason, session = null }) {
  const sale = await Sale.findOne({ _id: saleId, businessId: ctx.businessId }).session(session);
  if (!sale || sale.service?.kind !== kind) throw notFound("That payment wasn't found.");
  if (sale.status === "voided") throw conflict("That payment was already reversed.", "already_voided");

  sale.status = "voided";
  sale.voidInfo = { by: ctx.userId, byName: ctx.actorName, reason, at: new Date() };
  await sale.save({ session });

  const customer = sale.customerId ? await Customer.findById(sale.customerId).session(session) : null;
  if (customer) {
    customer.totalSpend = money(Math.max(0, customer.totalSpend - sale.total));
    await customer.save({ session });
  }

  const split = {};
  for (const p of sale.payments) split[p.method] = (split[p.method] || 0) - p.amount;
  await bumpDailyMetric(
    ctx, sale.branchId, localDay(sale.at),
    { revenue: -sale.total, profit: -sale.total, txns: -1, payments: split },
    session
  );
  return sale;
}

/** Service payments for a window — used by each overview's revenue figure. */
export async function servicePaymentsSince(ctx, kind, since) {
  const rows = await Sale.aggregate([
    { $match: { businessId: ctx.businessId, "service.kind": kind, status: "completed", at: { $gte: since } } },
    { $group: { _id: null, total: { $sum: "$total" }, n: { $sum: 1 } } },
  ]);
  return { total: money(rows[0]?.total || 0), count: rows[0]?.n || 0 };
}
