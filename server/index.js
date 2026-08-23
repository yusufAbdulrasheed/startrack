import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import "express-async-errors"; // async route errors reach the error handler
import cors from "cors";
import { config } from "#core/config.js";
import { connectDb } from "#core/db.js";
import { requireAuth } from "#core/middleware/requireAuth.js";
import { tenantContext } from "#core/middleware/tenant.js";
import { InsufficientStockError } from "#modules/inventory/inventory.service.js";
import { authRouter } from "#modules/auth/auth.routes.js";
import { staffRouter } from "#modules/staff/staff.routes.js";
import { productsRouter } from "#modules/products/products.routes.js";
import { inventoryRouter } from "#modules/inventory/inventory.routes.js";
import { salesRouter } from "#modules/sales/sales.routes.js";
import { returnsRouter } from "#modules/returns/returns.routes.js";
import { customersRouter } from "#modules/customers/customers.routes.js";
import { expensesRouter } from "#modules/expenses/expenses.routes.js";
import { attendanceRouter } from "#modules/staff/attendance.routes.js";
import { metricsRouter } from "#modules/metrics/metrics.routes.js";
import { settingsRouter } from "#modules/business/settings.routes.js";
import { auditRouter } from "#modules/audit/audit.routes.js";
import { notificationsRouter } from "#modules/alerts/notifications.routes.js";
import { jobsRouter } from "#modules/jobs/jobs.routes.js";
import { hotelRouter } from "#modules/hotel/hotel.routes.js";
import { platformRouter } from "#modules/platform/platform.routes.js";

const app = express();
app.set("trust proxy", 1); // real client IPs behind Render/railway proxies (rate limits)
// One app on one origin, so there is normally nothing to negotiate. CORS is
// switched on only when WEB_ORIGIN names a separately hosted client.
if (config.webOrigins.length) app.use(cors({ origin: config.webOrigins, credentials: true }));
app.use(express.json());

// Log every request so you can watch the backend work in the terminal.
app.use((req, res, next) => {
  const started = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - started;
    const color = res.statusCode >= 400 ? "\x1b[31m" : "\x1b[32m"; // red / green
    console.log(`${color}${res.statusCode}\x1b[0m ${req.method.padEnd(4)} ${req.originalUrl}  ${ms}ms`);
  });
  next();
});

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "startrack-api", time: new Date().toISOString() }));

// Public + session routes
app.use("/api/auth", authRouter);

// Business-data routes: auth → tenant context → module
const tenant = [requireAuth, tenantContext];
app.use("/api/staff", tenant, staffRouter);
app.use("/api/products", tenant, productsRouter);
app.use("/api/inventory", tenant, inventoryRouter);
app.use("/api/sales", tenant, salesRouter);
app.use("/api/returns", tenant, returnsRouter);
app.use("/api/customers", tenant, customersRouter);
app.use("/api/expenses", tenant, expensesRouter);
app.use("/api/attendance", tenant, attendanceRouter);
app.use("/api/metrics", tenant, metricsRouter);
app.use("/api/settings", tenant, settingsRouter);
app.use("/api/audit", tenant, auditRouter);
app.use("/api/notifications", tenant, notificationsRouter);
app.use("/api/jobs", tenant, jobsRouter);
app.use("/api/hotel", tenant, hotelRouter);

// StarTrack's own staff, looking across every tenant. Deliberately NOT behind
// `tenant` — it carries its own gate (see platform.routes.js).
app.use("/api/platform", platformRouter);

// Unknown API routes are a 404 in JSON — never the HTML app shell, which
// would turn a typo'd endpoint into a confusing 200.
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

// The built web client, served by this same process. One app, one origin, no
// CORS: in development Vite proxies /api here instead (see vite.config.ts).
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

// Central error handler — typed domain errors get proper statuses.
app.use((err, _req, res, _next) => {
  if (err instanceof InsufficientStockError) {
    return res.status(409).json({ error: err.code, message: err.message });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ error: "invalid_id", message: "That reference doesn't look right." });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "server", message: "Something went wrong on our side." });
});

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
