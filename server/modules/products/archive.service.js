import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { resolve, resolveByPrefix, keys } from "#modules/alerts/notify.js";
import { scopedToBranch } from "#core/branchScope.js";
import { audit } from "#core/audit.js";

/**
 * "Deleting" a product archives it: it leaves the catalog, the till and the
 * alerts, but past sales, returns and stock history still point at it, so
 * reports never lose their figures. Used by the single delete, the bulk
 * button and the AI's approved proposal, so all three behave the same.
 */

/** Active products this person's store can see, optionally narrowed to ids. */
export const archivableFilter = (ctx, ids) =>
  scopedToBranch(ctx, { businessId: ctx.businessId, status: "active", ...(ids ? { _id: { $in: ids } } : {}) });

/** Archives these products and clears their stock/expiry alerts. Returns how many changed. */
export async function archiveProducts(ctx, ids, { via = "" } = {}) {
  if (!ids.length) return 0;
  const target = await Product.find(archivableFilter(ctx, ids)).select("_id name");
  if (!target.length) return 0;
  const liveIds = target.map((p) => p._id);
  const res = await Product.updateMany({ _id: { $in: liveIds }, businessId: ctx.businessId }, { $set: { status: "archived" } });

  // An archived product can't be restocked or sold, so its alerts are noise.
  const levels = await Inventory.find({ businessId: ctx.businessId, productId: { $in: liveIds } }).select("branchId productId");
  for (let i = 0; i < levels.length; i += 25) {
    await Promise.all(
      levels.slice(i, i + 25).flatMap((l) => [
        resolveByPrefix(ctx.businessId, keys.expiryPrefix(l.branchId, l.productId)),
        resolve(ctx.businessId, keys.stock(l.branchId, l.productId)),
      ]),
    );
  }
  const n = res.modifiedCount ?? target.length;
  audit(ctx, "product.archive", { type: "product", label: n === 1 ? target[0].name : `${n} products` }, undefined, { count: n, via });
  return n;
}
