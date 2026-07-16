import mongoose from "mongoose";
import { config } from "./config.js";

/**
 * Connects Mongoose. If MONGODB_URI is set (the dev DB started by
 * `npm run dev`, or Atlas) we use it. Otherwise we boot a throwaway
 * in-process MongoDB so the API still works standalone with zero setup.
 */
export async function connectDb() {
  let uri = config.mongoUri;
  let memoryLabel = "";

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
  await mongoose.connect(uri);
  console.log(`✓ MongoDB connected${memoryLabel}`);
}
