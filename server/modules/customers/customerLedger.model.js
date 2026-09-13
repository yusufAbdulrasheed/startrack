import mongoose from "mongoose";
import { money } from "#core/money.js";

/**
 * The "credit" capability's audit trail — one row per event that changes
 * what a customer owes: a sale settled on credit (balance goes up) or a
 * repayment received later (balance comes down). Customer.creditBalance is
 * the fast-read running total; this collection is the append-only ledger
 * behind it, exactly the relationship StockMovement has with Inventory.stock.
 *
 * Nothing here is coldroom-specific — any business type with the "credit"
 * capability posts to the same collection — but coldroom is, today, the only
 * vertical whose own sale endpoint actually writes to it (see
 * server/modules/businesses/coldroom/coldroom.routes.js).
 */
const customerLedgerEntrySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    customerName: { type: String, default: "" },
    type: { type: String, enum: ["sale", "payment", "adjustment"], required: true },
    // Signed: positive increases what's owed (a credit sale), negative
    // decreases it (a repayment, or reversing a voided credit sale).
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    method: { type: String, enum: ["cash", "pos", "transfer"] }, // repayments only
    refType: { type: String, default: "" }, // "coldroom_sale" | "void" | "manual"
    refId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, default: "" },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

customerLedgerEntrySchema.index({ businessId: 1, customerId: 1, at: -1 });

export const CustomerLedgerEntry = mongoose.model("CustomerLedgerEntry", customerLedgerEntrySchema);

/**
 * Applies a signed balance change to a customer and appends the matching
 * ledger row in one call, so the two can never drift apart. Pass `session`
 * to enlist both writes in a transaction.
 */
export async function applyCreditChange(
  ctx,
  { customer, type, amount, method = undefined, refType = "", refId = null, note = "", session = null }
) {
  customer.creditBalance = money(customer.creditBalance + amount);
  await customer.save({ session });
  await CustomerLedgerEntry.create(
    [
      {
        accountId: ctx.accountId,
        businessId: ctx.businessId,
        branchId: ctx.branchId || null,
        customerId: customer._id,
        customerName: customer.name,
        type,
        amount: money(amount),
        balanceAfter: customer.creditBalance,
        method,
        refType,
        refId,
        note,
        byName: ctx.actorName,
      },
    ],
    { session }
  );
  return customer.creditBalance;
}
