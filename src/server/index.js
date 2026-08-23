import express from "express";
import "express-async-errors"; // async route errors reach the error handler
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { tenantContext } from "./middleware/tenant.js";
import { InsufficientStockError } from "./lib/inventoryService.js";
import { authRouter } from "./routes/auth.routes.js";
import { staffRouter } from "./routes/staff.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { inventoryRouter } from "./routes/inventory.routes.js";
import { salesRouter } from "./routes/sales.routes.js";
import { returnsRouter } from "./routes/returns.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { expensesRouter } from "./routes/expenses.routes.js";
import { attendanceRouter } from "./routes/attendance.routes.js";
import { metricsRouter } from "./routes/metrics.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { auditRouter } from "./routes/audit.routes.js";

const app = express();
app.set("trust proxy", 1); // real client IPs behind Render/railway proxies (rate limits)
app.use(cors({ origin: config.webOrigins, credentials: true }));
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

// Fallback 404 for unknown API routes
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

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
    const { cleanupSandboxes } = await import("./lib/demoSeed.js");
    cleanupSandboxes().catch((e) => console.error("sandbox sweep failed:", e.message));
    setInterval(() => cleanupSandboxes().catch((e) => console.error("sandbox sweep failed:", e.message)), 60 * 60 * 1000).unref();
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
