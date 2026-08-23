import mongoose from "mongoose";
import { config } from "#core/config.js";

/**
 * Connects Mongoose. If MONGODB_URI is set (the dev DB started by
 * `npm run dev`, or Atlas) we use it. Otherwise we boot a throwaway
 * in-process MongoDB so the API still works standalone with zero setup.
 */
export async function connectDb() {
  let uri = config.mongoUri;
  let memoryLabel = "";

  if (!uri && config.isProd) {
    // In production there is no embedded fallback — fail with a clear reason.
    throw new Error("MONGODB_URI is not set. Add it in the host's environment settings.");
  }
  if (!uri) {
    // Lazy import so production never loads the dev-only dependency.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const mem = await MongoMemoryServer.create({ instance: { dbName: "startrack" } });
    uri = mem.getUri();
    memoryLabel = " (throwaway in-memory DB — data resets on restart)";
    // Keep a handle so it isn't garbage-collected.
    globalThis.__mem = mem;
  }

  mongoose.set("strictQuery", true);
  try {
    // Fail fast with a readable hint instead of a 30s silent hang.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  } catch (err) {
    if (/whitelist|IP|Server selection timed out|ENOTFOUND|querySrv/i.test(err.message)) {
      throw new Error(
        `Could not reach MongoDB: ${err.message}\n` +
        `HINT: check Atlas → Network Access allows 0.0.0.0/0, and that MONGODB_URI (host, username, password) is correct.`
      );
    }
    throw err;
  }
  console.log(`✓ MongoDB connected${memoryLabel}`);
}
