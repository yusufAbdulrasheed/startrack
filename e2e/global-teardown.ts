import mongoose from "mongoose";
import { MONGO_URI, assertLocalMongo } from "./support/env";

/** Leave nothing behind: drop the throwaway database. */
export default async function globalTeardown() {
  assertLocalMongo();
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
