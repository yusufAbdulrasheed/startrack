import { Order } from "#modules/storefront/order.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { nextSeq } from "#core/counters.js";
import { HttpError, conflict } from "#core/httpError.js";
import { runCheckout } from "#modules/sales/checkout.service.js";
import { afterStockChange } from "#modules/alerts/alerts.service.js";
import { audit } from "#core/audit.js";
import { priceBasket, shopperConfig, notifyNewOrder, emailOwnerNewOrder, emailCustomerStatus, closeOrderNotice, orderNoFor } from "#modules/storefront/store.service.js";

/** What a customer asked for, already shape-checked by the route. */
export async function placeOrder(business, shopper, input) {
  // A retry of the same attempt (double tap, flaky signal) returns the first result.
  const again = await Order.findOne({ shopperId: shopper._id, clientOrderId: input.clientOrderId });
  if (again) return { order: again, replay: true };

  const cfg = shopperConfig(business);
  if (!cfg.acceptingOrders) throw new HttpError(409, "store_paused", "This store isn't taking orders right now. Please try again later.");
  const fType = input.fulfilment.type;
  if (!cfg[fType]) throw new HttpError(400, "invalid", fType === "delivery" ? "This store doesn't deliver." : "This store doesn't offer pickup.");
  if (!cfg.payments[input.payment.method]) throw new HttpError(400, "invalid", "That payment option isn't available for this order.");
  // How you pay has to fit how you receive: you can't pay "on delivery" for something you collect.
  if ((input.payment.method === "cash_on_delivery" && fType !== "delivery") || (input.payment.method === "pay_at_pickup" && fType !== "pickup")) {
    throw new HttpError(400, "invalid", "That payment option doesn't match how you chose to receive the order.");
  }
  const address = (input.fulfilment.address || "").trim();
  if (fType === "delivery" && address.length < 8) throw new HttpError(400, "invalid", "Enter the full delivery address.");

  const priced = await priceBasket(business, input.items, fType);
  if (priced.problems.length) return { problems: priced.problems, priced };
  if (input.expectedTotal !== undefined && Math.abs(input.expectedTotal - priced.total) > 0.01) return { priceChanged: true, priced };

  const seq = await nextSeq(`order:${business._id}`);
  const order = await Order.create({
    accountId: business.accountId,
    businessId: business._id,
    branchId: priced.branchId,
    orderNo: orderNoFor(seq),
    shopperId: shopper._id,
    customerId: shopper.customerId,
    contact: { name: shopper.name, phone: input.contactPhone || shopper.phone, email: shopper.email },
    items: priced.lines,
    subtotal: priced.subtotal,
    vat: priced.vat,
    deliveryFee: priced.deliveryFee,
    total: priced.total,
    fulfilment: { type: fType, address: fType === "delivery" ? address : "" },
    note: (input.note || "").trim(),
    payment: { method: input.payment.method, status: "unpaid" },
    status: "placed",
    history: [{ status: "placed", by: shopper.name }],
    clientOrderId: input.clientOrderId,
  });

  // Remember where to deliver next time, on the owner's customer record too.
  if (fType === "delivery") {
    await Customer.updateOne({ _id: shopper.customerId, address: "" }, { $set: { address } }).catch(() => {});
    if (!shopper.address) { shopper.address = address; await shopper.save().catch(() => {}); }
  }

  // Tell people, but never let that fail or slow the order.
  notifyNewOrder(business, order);
  emailOwnerNewOrder(business, order);
  emailCustomerStatus(business, order);
  return { order };
}

/** A customer withdrawing an order the shop hasn't accepted yet. */
export async function cancelByCustomer(business, shopper, orderId) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, shopperId: shopper._id, status: "placed" },
    { $set: { status: "cancelled", reason: "Cancelled by customer" }, $push: { history: { status: "cancelled", by: shopper.name, note: "Cancelled by customer" } } },
    { new: true }
  );
  if (!order) throw conflict("This order can't be cancelled any more — the shop has already started on it. Please contact them.", "not_cancellable");
  closeOrderNotice(business._id, order._id);
  return order;
}

// ── the owner's side ────────────────────────────────────────────────────────

const PAY_AS = { cash_on_delivery: "cash", pay_at_pickup: "cash", transfer: "transfer" };

/**
 * Accepts an order and records the sale. The sale and the order's new status
 * commit together (checkout.service's onCreated hook), so there is never a
 * confirmed order without its sale, or a sale for an order nobody confirmed.
 */
export async function confirmOrder(ctx, order) {
  const cx = { ...ctx, branchId: order.branchId }; // sell from the branch the customer saw
  const { out } = await runCheckout(
    cx,
    {
      items: order.items.map((i) => ({ productId: String(i.productId), qty: i.qty })),
      discount: 0,
      payments: [{ method: PAY_AS[order.payment.method], amount: order.total }],
      customerId: String(order.customerId),
    },
    {
      channel: "online",
      orderId: order._id,
      orderNo: order.orderNo,
      quotedPrices: new Map(order.items.map((i) => [String(i.productId), i.unitPrice])),
      deliveryFee: order.deliveryFee,
      vat: order.vat,
      customerAnyBranch: true,
      onCreated: async (session, sale) => {
        const claimed = await Order.findOneAndUpdate(
          { _id: order._id, status: "placed" },
          { $set: { status: "confirmed", saleId: sale._id, saleNo: sale.saleNo }, $push: { history: { status: "confirmed", by: ctx.actorName } } },
          { session, new: true }
        );
        if (!claimed) throw conflict("Someone already handled this order.", "order_handled");
      },
    }
  );
  afterStockChange(cx, order.branchId, out.deductedIds);
  audit(ctx, "order.confirm", { type: "order", id: order._id, label: order.orderNo }, undefined, { saleNo: out.saleNo, total: order.total });
  closeOrderNotice(order.businessId, order._id);
  return Order.findById(order._id);
}

export async function rejectOrder(ctx, order, reason) {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: "placed" },
    { $set: { status: "rejected", reason }, $push: { history: { status: "rejected", by: ctx.actorName, note: reason } } },
    { new: true }
  );
  if (!updated) throw conflict("Someone already handled this order.", "order_handled");
  audit(ctx, "order.reject", { type: "order", id: order._id, label: order.orderNo }, undefined, { reason });
  closeOrderNotice(order.businessId, order._id);
  return updated;
}

// What may follow what. Cancelling a confirmed order means voiding its sale
// (which also puts the stock back) — see the hook in sales.routes.js.
const NEXT = {
  confirmed: ["ready", "out_for_delivery", "completed"],
  ready: ["out_for_delivery", "completed"],
  out_for_delivery: ["completed"],
};

export async function advanceOrder(ctx, order, next) {
  if (!NEXT[order.status]?.includes(next)) throw conflict(`An order that is ${order.status.replace(/_/g, " ")} can't move to ${next.replace(/_/g, " ")}.`, "bad_transition");
  if (next === "out_for_delivery" && order.fulfilment.type !== "delivery") throw conflict("Only delivery orders can go out for delivery.", "bad_transition");
  const set = { status: next };
  // Handing the goods over is when cash-on-delivery / pay-at-pickup money changes hands.
  if (next === "completed" && order.payment.status === "unpaid") {
    set["payment.status"] = "paid";
    set["payment.paidAt"] = new Date();
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: set, $push: { history: { status: next, by: ctx.actorName } } },
    { new: true }
  );
  if (!updated) throw conflict("Someone else just updated this order. Refresh and try again.", "order_handled");
  return updated;
}

export async function markPaid(ctx, order) {
  if (["cancelled", "rejected"].includes(order.status)) throw conflict("This order was cancelled.", "bad_transition");
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, "payment.status": "unpaid" },
    { $set: { "payment.status": "paid", "payment.paidAt": new Date() }, $push: { history: { status: order.status, by: ctx.actorName, note: "Payment received" } } },
    { new: true }
  );
  return updated || order;
}

export const tellCustomer = emailCustomerStatus;
