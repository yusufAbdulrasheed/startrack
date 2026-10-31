import { Customer } from "#modules/customers/customer.model.js";
import { limitOf } from "#shared/plans.js";

/**
 * How many more customers this business may hold on its plan. Counted per
 * business, like products. Existing customers over the limit (after a plan drop)
 * are never touched — the only effect is that no more can be added.
 */
export async function customerRoom(businessId, plan, session = null) {
  const cap = limitOf(plan, "customers");
  const count = await Customer.countDocuments({ businessId }).session(session);
  return { cap, count, remaining: cap === null ? Infinity : Math.max(0, cap - count) };
}
