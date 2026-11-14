import mongoose from "mongoose";
import { Product } from "#modules/products/product.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { nextSeq } from "#core/counters.js";
import { bumpDailyMetric, localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { withTransaction } from "#core/tx.js";
import { badRequest } from "#core/httpError.js";
import { checkoutFor } from "#platform/registry.js";
import { evaluateAndIssuePatronageCard } from "#modules/loyalty/loyaltyCard.service.js";
import { scopedToBranch, ownerBranchForNew } from "#core/branchScope.js";
import { customerRoom } from "#modules/customers/customerLimit.js";
import { changeStoreCredit } from "#modules/customers/storeCredit.js";

/**
 * The one place a sale is made: prices, totals, stock, customer tallies, loyalty
 * and daily metrics, all in one transaction. The till (sales.routes.js) and the
 * online store (storefront/orders.service.js) both come through here, so a sale
 * is a sale however it arrived.
 *
 * `ctx` is the tenant context. The till passes the signed-in staff member's;
 * the online store passes a synthetic one (see storefront/storeContext.js).
 *
 * opts (all optional, all used only by online orders):
 *   channel, orderId, orderNo  tag the sale with where it came from
 *   quotedPrices               Map<productId, price> the customer was shown
 *   deliveryFee                flat delivery charge added to the total
 *   vat                        VAT the customer was quoted (instead of recomputing it)
 *   customerAnyBranch          find the customer in any store (online customers belong to the business)
 *   onCreated(session, sale)   runs inside the transaction, after the sale exists
 */
export async function runCheckout(ctx, d, opts = {}) {
  const settings = ctx.business.settings;
  let newLoyaltyCard = null; // set inside the transaction below, emailed after commit

  const out = await withTransaction(async (session) => {
    // Idempotent replay: the offline queue can safely retry.
    if (d.clientSaleId) {
      const existing = await Sale.findOne({
        businessId: ctx.businessId,
        clientSaleId: d.clientSaleId,
      }).session(session);
      if (existing) return { replayed: true, sale: existing };
    }

    // A store can only ring up what it sells (its own items + shared ones).
    const products = await Product.find(scopedToBranch(ctx, {
      _id: { $in: [...new Set(d.items.map((i) => i.productId))] },
      businessId: ctx.businessId,
      status: "active",
    })).session(session);
    const byId = new Map(products.map((p) => [String(p._id), p]));
    for (const item of d.items) {
      if (!byId.has(item.productId)) throw badRequest("One of the products no longer exists.");
    }

    // Split by what each product IS. Plain stock lines merge by product and are
    // priced right here. An item of an archetype a business owns (blinds'
    // made-to-order, academy's services) goes to THAT business's handler,
    // registered with the platform; a business with no handler for an
    // archetype simply can't sell that kind of item.
    const biz = checkoutFor(ctx.business.typeKey);
    const qtyByProduct = new Map();
    const byArchetype = new Map();
    for (const item of d.items) {
      const p = byId.get(item.productId);
      const kind = p.archetype || "stock";
      if (kind === "stock") qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.qty);
      else if (biz.archetypes?.[kind]) byArchetype.set(kind, [...(byArchetype.get(kind) || []), item]);
      else throw badRequest(`${p.name} can't be sold by this kind of business.`);
    }

    // Server-side pricing and totals — stock lines.
    const lines = [...qtyByProduct.entries()].map(([productId, qty]) => {
      const p = byId.get(productId);
      const unit = opts.quotedPrices?.get(productId) ?? p.price;
      return {
        productId: p._id,
        name: p.name,
        qty,
        unitPrice: unit,
        lineCost: money(p.cost * qty),
        lineNet: money(unit * qty),
        returnedQty: 0,
        components: [],
      };
    });

    for (const [kind, kindItems] of byArchetype) {
      lines.push(...(await biz.archetypes[kind].lines({ ctx, items: kindItems, byId, opts, session })));
    }

    // Anything the business needs to check BEFORE stock moves (electronics: the
    // serial numbers the cashier picked). It may refuse the sale by throwing,
    // and may return a `commit` to run once the sale exists.
    const afterSale = [];
    if (biz.validate) {
      const v = await biz.validate({ ctx, items: d.items, byId, lines, session });
      if (v?.commit) afterSale.push(v.commit);
    }

    const subtotal = money(lines.reduce((s, l) => s + l.lineNet, 0));
    const discount = money(Math.min(d.discount, subtotal));
    const vat = opts.vat !== undefined ? money(opts.vat) : settings.vatEnabled ? money(((subtotal - discount) * settings.vatRate) / 100) : 0;
    // A flat delivery charge (online orders). Not taxed, not a discount base.
    const deliveryFee = money(opts.deliveryFee || 0);
    const total = money(subtotal - discount + vat + deliveryFee);

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

    const storeCreditPaid = money(d.payments.find((p) => p.method === "store_credit")?.amount || 0);

    // Resolve the customer before moving stock (cheap to fail early).
    let customer = null;
    let unsavedCustomerName = ""; // a name we couldn't add to the book (plan limit)
    if (d.customerId) {
      customer = await Customer.findOne(opts.customerAnyBranch ? { _id: d.customerId, businessId: ctx.businessId } : scopedToBranch(ctx, { _id: d.customerId, businessId: ctx.businessId })).session(session);
      if (!customer) throw badRequest("That customer doesn't exist.");
    } else if (d.customer?.name) {
      const known = d.customer.phone && (await Customer.findOne(scopedToBranch(ctx, { businessId: ctx.businessId, phone: d.customer.phone })).session(session));
      // A plan's customer limit never stops a sale: past it, the name still goes
      // on the receipt, it just isn't added to the customer book.
      const full = !known && (await customerRoom(ctx.businessId, ctx.plan, session)).remaining <= 0;
      if (full) unsavedCustomerName = d.customer.name;
      customer =
        known ||
        (full
          ? null
          : (
              await Customer.create(
                [{
                  accountId: ctx.accountId,
                  businessId: ctx.businessId,
                  branchId: await ownerBranchForNew(ctx),
                  name: d.customer.name,
                  phone: d.customer.phone,
                  whatsapp: d.customer.phone,
                }],
                { session }
              )
            )[0]);
    }

    if (storeCreditPaid > 0) {
      if (!customer?._id) throw badRequest("Store credit belongs to a customer. Attach the customer to this sale first.", "needs_customer");
      if ((customer.storeCredit || 0) + 0.001 < storeCreditPaid) {
        throw badRequest(`${customer.name} has ${money(customer.storeCredit || 0)} in store credit, less than ${storeCreditPaid}.`, "insufficient_credit");
      }
    }

    // Mint the sale id up front so every movement points at it from birth.
    const saleId = new mongoose.Types.ObjectId();

    // Flatten every deduction: stock lines move themselves; made-to-order
    // lines move their components instead (the blind itself has no stock).
    const deductions = [];
    for (const line of lines) {
      if (line.service) continue; // nothing to count
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
        await applyMovement(ctx, {
          branchId: ctx.branchId,
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
          await applyMovement(ctx, {
            branchId: ctx.branchId, productId: ded.productId, productName: ded.name,
            type: "IN", qty: ded.qty, refType: "sale", reason: "Checkout rollback",
          }).catch((e) => console.error("checkout rollback failed:", ded.name, e.message));
        }
      }
      throw err;
    }

    const seq = await nextSeq(`sale:${ctx.branchId}`, session);
    const saleNo = `R-${String(seq).padStart(5, "0")}`;

    const [sale] = await Sale.create(
      [{
        _id: saleId,
        accountId: ctx.accountId,
        businessId: ctx.businessId,
        branchId: ctx.branchId,
        saleNo,
        staffId: ctx.userId,
        staffName: ctx.actorName,
        customerId: customer?._id,
        customerName: customer?.name || unsavedCustomerName,
        ...(opts.channel ? { channel: opts.channel, orderId: opts.orderId, orderNo: opts.orderNo } : {}),
        deliveryFee,
        items: lines,
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

    // Paid (partly) with store credit: take it off the customer's credit in the
    // same transaction, so the sale and the credit used commit together.
    if (storeCreditPaid > 0) {
      await changeStoreCredit(ctx, customer._id, -storeCreditPaid, { refType: "sale", refId: sale._id, refNo: saleNo, session });
    }

    // Lets the caller commit its own change (e.g. mark an online order
    // confirmed) in the SAME transaction as the sale — both happen or neither.
    if (opts.onCreated) await opts.onCreated(session, sale);

    if (customer) {
      customer.totalSpend = money(customer.totalSpend + total);
      customer.visits += 1;
      customer.lastSeen = new Date();
      customer.lastBranchId = ctx.branchId;
      // Whatever this business does with a sale that has a customer (water
      // counts its loyalty tokens here).
      if (biz.onCustomerSale) await biz.onCustomerSale({ ctx, customer, lines, session });
      await customer.save({ session });

      // Loyalty QR cards (any business — see settings.loyaltyRule). DB
      // reads/writes only here, safe inside the transaction; the email
      // goes out after commit, below. "Missing modules list" means
      // everything is on, same convention as hasModule() client-side —
      // but loyaltyRule.mode defaults to "off", so nothing actually
      // fires until an owner explicitly configures a rule in Settings.
      const modules = ctx.business.settings?.modules;
      if (!modules || modules.includes("loyaltyCard")) {
        newLoyaltyCard = await evaluateAndIssuePatronageCard(ctx, customer, ctx.business, session);
      }
    }

    for (const commit of afterSale) await commit(session, { saleId, customer, byId });

    const totalCost = money(lines.reduce((s, l) => s + l.lineCost, 0));
    const payments = {};
    for (const p of d.payments) payments[p.method] = (payments[p.method] || 0) + p.amount;
    await bumpDailyMetric(
      ctx,
      ctx.branchId,
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
      sale, customer, lines, subtotal, discount, vat, deliveryFee, total, saleNo, tendered, change,
      deductedIds: deductions.map((d) => d.productId),
    };
  });

  return { out, newLoyaltyCard };
}
