import { Inventory } from "#modules/inventory/inventory.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";

export class InsufficientStockError extends Error {
  constructor(productName, available, wanted) {
    super(`Not enough stock for ${productName} — ${available} left, ${wanted} needed.`);
    this.code = "insufficient_stock";
    this.productName = productName;
    this.available = available;
    this.wanted = wanted;
  }
}

/**
 * THE only door through which stock changes. Applies a signed quantity to the
 * branch's cached level (guarding against overselling atomically) and appends
 * the corresponding ledger movement with the balance after.
 *
 * Pass `session` to enlist the change in a transaction — the caller's abort
 * then takes the level and the ledger row back together.
 */
export async function applyMovement(
  ctx,
  { branchId, productId, productName, type, qty, refType = "", refId = null, reason = "", session = null }
) {
  let inv;
  if (qty < 0) {
    // Atomic decrement guarded by available stock — no oversell under races.
    inv = await Inventory.findOneAndUpdate(
      { branchId, productId, stock: { $gte: -qty } },
      { $inc: { stock: qty } },
      { new: true, session }
    );
    if (!inv) {
      const current = await Inventory.findOne({ branchId, productId }).session(session);
      throw new InsufficientStockError(productName, current?.stock ?? 0, -qty);
    }
  } else {
    inv = await Inventory.findOneAndUpdate(
      { branchId, productId },
      {
        $inc: { stock: qty },
        $setOnInsert: { accountId: ctx.accountId, businessId: ctx.businessId },
      },
      { new: true, upsert: true, session }
    );
  }

  await StockMovement.create(
    [
      {
        accountId: ctx.accountId,
        businessId: ctx.businessId,
        branchId,
        productId,
        productName,
        type,
        qty,
        balanceAfter: inv.stock,
        refType,
        refId,
        reason,
        actorId: ctx.userId,
        actorName: ctx.actorName,
      },
    ],
    { session }
  );

  return inv.stock;
}
