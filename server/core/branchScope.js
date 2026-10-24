import { Branch } from "#modules/business/branch.model.js";

/**
 * Store-level ownership of catalog records (products, customers).
 *
 * A record's `branchId` is either empty — shared by every store of the
 * business, which is how everything created before multi-store ownership
 * behaves — or the one store it belongs to. A store only sees shared records
 * plus its own, so two shops under one owner no longer share a price list or
 * a customer book.
 */

// Adds the "visible at the active store" condition to a Mongo filter without
// clobbering an $or/$and the caller already put there. No active store (an
// owner looking at the whole business) means no restriction.
export function scopedToBranch(ctx, filter = {}) {
  if (!ctx.branchId) return filter;
  return {
    ...filter,
    $and: [...(filter.$and || []), { $or: [{ branchId: null }, { branchId: ctx.branchId }] }],
  };
}

// Where a newly created record should live. Single-store businesses keep
// everything shared (nothing to separate). With several stores a record
// defaults to the active store unless the caller asks to share it.
export async function ownerBranchForNew(ctx, { shared = false } = {}) {
  if (shared || !ctx.branchId) return null;
  const stores = await Branch.countDocuments({ businessId: ctx.businessId });
  return stores > 1 ? ctx.branchId : null;
}
