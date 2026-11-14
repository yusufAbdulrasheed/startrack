import mongoose from "mongoose";

/**
 * Deletes everything a set of accounts owns: every collection whose records
 * carry an `accountId` (the platform's own, and each business's).
 *
 * It asks Mongoose which models exist instead of naming them, so a business
 * added later (with its own collections) is cleaned up without anyone having to
 * remember to list it here. Used for throwaway data only: the 24-hour demo
 * sandbox and the showcase accounts. Models load when their module is imported,
 * so call this from a process that has loaded the app (or the business
 * registry), which every caller does.
 *
 * Collections keyed some other way (users, verification codes, counters, the
 * account itself) are the caller's to remove.
 */
export async function purgeAccountData(accountIds) {
  if (!accountIds?.length) return;
  const byAccount = { accountId: { $in: accountIds } };
  await Promise.all(
    Object.values(mongoose.models)
      .filter((model) => model.schema.path("accountId"))
      .map((model) => model.deleteMany(byAccount))
  );
}
