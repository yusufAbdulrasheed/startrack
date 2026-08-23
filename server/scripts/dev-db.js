import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * Runs the local dev MongoDB as its own long-lived process, on a fixed port,
 * with data stored in .data/ at the repo root (so it survives restarts).
 * The API connects to it via MONGODB_URI — API restarts never touch the DB.
 *
 * It is a one-member REPLICA SET, not a standalone: MongoDB only offers
 * multi-document transactions on a replica set, and checkout needs one
 * (blueprint §2). Atlas is a replica set too, so dev matches production.
 */
const PORT = 27818;
const REPL_SET = "rs0";
const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.data/mongo");

function portInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

if (await portInUse(PORT)) {
  console.log(`✓ Dev MongoDB already running on port ${PORT} — reusing it.`);
  // Stay alive so `concurrently -k` doesn't take the other processes down.
  setInterval(() => {}, 60_000);
} else {
  fs.mkdirSync(dbPath, { recursive: true });
  const mem = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: REPL_SET, dbName: "startrack", storageEngine: "wiredTiger" },
    instanceOpts: [{ port: PORT, dbPath }],
  });
  console.log(`✓ Dev MongoDB (replica set ${REPL_SET}) running on ${mem.getUri()}`);
  console.log(`  Data persists in .data/mongo · transactions enabled`);

  const stop = async () => {
    await mem.stop({ doCleanup: false }); // clean shutdown, keep the data
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
