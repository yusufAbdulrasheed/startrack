import mongoose from "mongoose";

/**
 * Multi-document transactions (blueprint §2: "movement + sale + customer
 * update commit together or not at all").
 *
 * MongoDB only offers them on a replica set or a sharded cluster. Dev and
 * production both run one (see server/scripts/dev-db.js and Atlas), but a
 * plain standalone mongod is still a configuration someone can point us at —
 * so the first attempt probes support and every later call remembers the
 * answer. When they're unavailable the callback still runs, just without a
 * session, and each caller falls back to compensating writes.
 */
let supported = null; // null = not probed yet

export const transactionsAvailable = () => supported !== false;

// The server's way of saying "this deployment has no transactions".
function isUnsupported(err) {
  return (
    err?.code === 20 || // IllegalOperation
    err?.codeName === "IllegalOperation" ||
    /replica set member or mongos|Transaction numbers are only allowed/i.test(err?.message || "")
  );
}

/**
 * Runs fn inside a transaction, committing on return and aborting on throw.
 * fn receives the session (or null when the deployment has none) and MUST
 * pass it to every read and write it makes, or that operation will land
 * outside the transaction and survive an abort.
 *
 * fn may be retried by the driver on transient errors, so it must be safe to
 * run more than once — keep response-building out of it.
 */
export async function withTransaction(fn) {
  if (supported === false) return fn(null);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    supported = true;
    return result;
  } catch (err) {
    if (isUnsupported(err)) {
      supported = false;
      console.warn(
        "⚠ This MongoDB has no transaction support (standalone server).\n" +
          "  Money operations will use compensating writes instead — safe, but a\n" +
          "  crash mid-write can leave stock and sales briefly out of step.\n" +
          "  Run a replica set to remove that window."
      );
      return fn(null);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}
