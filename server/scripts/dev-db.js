import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Runs the local dev MongoDB as its own long-lived process, on a fixed port,
 * with data stored in server/.data/mongo (so it survives restarts).
 * The API connects to it via MONGODB_URI — API restarts never touch the DB.
 */
const PORT = 27818;
const dbPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.data/mongo");

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
  const mem = await MongoMemoryServer.create({
    instance: { port: PORT, dbName: "startrack", dbPath, storageEngine: "wiredTiger" },
  });
  console.log(`✓ Dev MongoDB running on ${mem.getUri()}`);
  console.log(`  Data persists in server/.data/mongo`);

  const stop = async () => {
    await mem.stop({ doCleanup: false }); // clean shutdown, keep the data
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
