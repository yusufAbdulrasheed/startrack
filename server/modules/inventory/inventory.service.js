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
 * Opening stock for products that were created a moment ago — in bulk.
 *
 * Writes exactly what applyMovement would for each one (a stock level and an
 * "IN" ledger row whose balance is that level), in two batched inserts rather
 * than two round trips per product. It is only safe because the products are
 * brand new: no level exists yet to race against or to add onto, and the
 * unique {branchId, productId} index would reject a clash anyway. Anything
 * touching existing stock must still go through applyMovement.
 */
export async function openStockInBulk(ctx, { branchId, items, reason }) {
  const rows = items.filter((i) => i.qty > 0);
  if (!rows.length) return 0;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await Inventory.insertMany(
      chunk.map((r) => ({ accountId: ctx.accountId, businessId: ctx.businessId, branchId, productId: r.productId, stock: r.qty })),
      { ordered: false }
    );
    await StockMovement.insertMany(
      chunk.map((r) => ({
        accountId: ctx.accountId, businessId: ctx.businessId, branchId,
        productId: r.productId, productName: r.productName,
        type: "IN", qty: r.qty, balanceAfter: r.qty,
        refType: "manual", reason,
        actorId: ctx.userId, actorName: ctx.actorName,
      })),
      { ordered: false }
    );
  }
  return rows.length;
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
  {
    branchId, productId, productName, type, qty, refType = "", refId = null, reason = "", session = null,
    // Optional passthroughs, stored on the ledger row only when given —
    // every existing caller omits them and sees no change in behavior.
    unitCost = undefined, supplierId = null, supplierName = "", wasteReason = undefined,
  }
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
        ...(unitCost !== undefined ? { unitCost } : {}),
        ...(supplierId ? { supplierId, supplierName } : {}),
        ...(wasteReason ? { wasteReason } : {}),
      },
    ],
    { session }
  );

  return inv.stock;
}
