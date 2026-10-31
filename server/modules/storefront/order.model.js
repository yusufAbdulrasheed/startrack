import mongoose from "mongoose";

/**
 * An order placed on the online store.
 *
 * An order is a REQUEST until the owner confirms it. Confirming is what makes
 * it a sale: stock leaves, the customer's totals move, the day's figures grow
 * (see orders.service.js → sales/checkout.service.js). That keeps the books
 * honest — an order nobody fulfils never counts as revenue — and means a sale
 * recorded online is indistinguishable from one rung up at the till, apart
 * from its `channel`.
 */
export const ORDER_STATUSES = ["placed", "confirmed", "ready", "out_for_delivery", "completed", "cancelled", "rejected"];

const orderSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The branch whose stock this order draws on.
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    orderNo: { type: String, required: true },
    shopperId: { type: mongoose.Schema.Types.ObjectId, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Copied at order time: the record must still read correctly after the
    // customer edits their profile.
    contact: { name: String, phone: String, email: String },
    items: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        qty: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true },
        lineNet: { type: Number, required: true },
        imageUrl: { type: String, default: "" },
      },
    ],
    subtotal: { type: Number, required: true },
    vat: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    fulfilment: {
      type: { type: String, enum: ["pickup", "delivery"], required: true },
      address: { type: String, default: "" },
    },
    note: { type: String, default: "" },
    payment: {
      method: { type: String, enum: ["cash_on_delivery", "pay_at_pickup", "transfer"], required: true },
      status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
      paidAt: { type: Date },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "placed" },
    history: [{ _id: false, status: String, at: { type: Date, default: Date.now }, by: { type: String, default: "" }, note: { type: String, default: "" } }],
    // Set when the owner confirms.
    saleId: { type: mongoose.Schema.Types.ObjectId },
    saleNo: { type: String },
    // Why it didn't happen, in the owner's or customer's words.
    reason: { type: String, default: "" },
    // The browser's own id for this attempt, so a double-tap or a retry on a bad
    // connection can never place the order twice.
    clientOrderId: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ businessId: 1, status: 1, createdAt: -1 });
orderSchema.index({ businessId: 1, orderNo: 1 }, { unique: true });
orderSchema.index({ shopperId: 1, createdAt: -1 });
orderSchema.index({ saleId: 1 }, { sparse: true });
orderSchema.index({ shopperId: 1, clientOrderId: 1 }, { unique: true, partialFilterExpression: { clientOrderId: { $type: "string" } } });

export const Order = mongoose.model("Order", orderSchema);
