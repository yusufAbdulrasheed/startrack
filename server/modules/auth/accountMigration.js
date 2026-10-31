import { Account } from "#modules/auth/account.model.js";
import { Counter } from "#core/counters.js";

/**
 * When the trial rules began (new accounts get TRIAL_DAYS of a bigger plan, then
 * drop to Freemium), accounts that already existed were promised to keep what
 * they have. This marks each of them `grandfathered` — full access, no expiry —
 * exactly once, on the first boot after the change.
 *
 * Accounts created under the new rules always carry `subscription.registeredPlan`;
 * the old ones never did, which is what tells them apart. A marker document makes
 * the whole thing run a single time, so an account whose trial later ends is never
 * swept back up on a restart.
 */
export async function migrateExistingAccounts() {
  const marker = await Counter.findOneAndUpdate(
    { scopeKey: "migration:grandfather-v1" },
    { $setOnInsert: { seq: 1 } },
    { upsert: true, new: false }
  );
  if (marker) return { ran: false, count: 0 };

  const res = await Account.updateMany(
    {
      isSandbox: { $ne: true },
      "subscription.plan": { $exists: true },
      "subscription.registeredPlan": { $exists: false },
      "subscription.grandfathered": { $ne: true },
    },
    { $set: { "subscription.grandfathered": true } }
  );
  if (res.modifiedCount) console.log(`✓ ${res.modifiedCount} existing account${res.modifiedCount === 1 ? "" : "s"} kept on full access (early access)`);
  return { ran: true, count: res.modifiedCount };
}
