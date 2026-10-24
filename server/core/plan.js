import { Account } from "#modules/auth/account.model.js";
import { effectivePlan, planAllows } from "#shared/plans.js";

/** The plan a business's account is on right now (for jobs that run outside a request). */
export async function planOfBusiness(business) {
  const account = await Account.findById(business.accountId).select("isSandbox subscription");
  return effectivePlan(account);
}

export async function businessHasFeature(business, feature) {
  return planAllows(await planOfBusiness(business), feature);
}
