import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { app } from "./app.js";
import { config } from "#core/config.js";
import { connectDb } from "#core/db.js";

// The built web client, served by this same process. One app, one origin, no
// CORS: in development Vite proxies /api here instead (see vite.config.ts).
// Only relevant to a standalone-server deploy (Render, local dev) — a
// Netlify deploy serves dist/ itself via its own CDN and never runs this
// file at all (see netlify/functions/api.js), so it never reaches here.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false, maxAge: "1h" }));
  // Client-side routing: any non-API path returns the app shell and lets the
  // router work out what to show.
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
} else if (config.isProd) {
  console.error("FATAL: dist/ is missing. Run `npm run build` before starting in production.");
  process.exit(1);
}

/**
 * Render (and similar free hosts) spin a web service down after 15 minutes
 * with no inbound HTTP request, which turns the next real visit into a
 * 30–60s cold start. Pinging our own public health check well inside that
 * window keeps the service looking active — the same trick as an external
 * uptime monitor, just self-contained so nothing else needs to be set up.
 *
 * Only runs when a URL is actually configured (see config.js) — blank in
 * local dev, and on any host that isn't on a sleep-after-idle free tier.
 */
function startKeepAwake() {
  const url = config.keepAwakeUrl;
  if (!url) return () => {};

  const every = 10 * 60 * 1000; // well under Render's 15-minute idle timeout
  const ping = async () => {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(15_000) });
      console.log(`💓 keep-awake ping → ${res.status}`);
    } catch (err) {
      // A missed ping just means the next one is 10 minutes away — never
      // worth crashing over, and rarely worth more than a quiet log line.
      console.warn(`💓 keep-awake ping failed: ${err.message}`);
    }
  };
  const timer = setInterval(ping, every);
  timer.unref();
  console.log(`💓 Keep-awake ping every 10m → ${url}/api/health`);
  return () => clearInterval(timer);
}

async function start() {
  try {
    await connectDb();
    // Sweep expired demo sandboxes on boot and hourly thereafter.
    const { cleanupSandboxes } = await import("#modules/auth/demoSeed.js");
    cleanupSandboxes().catch((e) => console.error("sandbox sweep failed:", e.message));
    setInterval(() => cleanupSandboxes().catch((e) => console.error("sandbox sweep failed:", e.message)), 60 * 60 * 1000).unref();
    // Make sure StarTrack itself always has a way in. Promoting by email on
    // boot beats hand-editing the database, and is a no-op once set.
    if (config.platformOwnerEmail) {
      const { User } = await import("#modules/auth/user.model.js");
      const promoted = await User.findOneAndUpdate(
        { email: config.platformOwnerEmail },
        { $set: { platformRole: "overseer" } }
      );
      console.log(
        promoted
          ? `✓ Platform overseer: ${config.platformOwnerEmail}`
          : `⚠ PLATFORM_OWNER_EMAIL (${config.platformOwnerEmail}) has no account yet — sign up with it, then restart.`
      );
    }

    // Watch for expiring stock and unattended returns, and email the digest.
    const { startAlertScheduler } = await import("#modules/alerts/alerts.service.js");
    startAlertScheduler();
    startKeepAwake();
    app.listen(config.port, () => {
      console.log(`\n🚀 StarTrack API running on http://localhost:${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/api/health\n`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
