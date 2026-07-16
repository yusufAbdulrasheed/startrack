import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { authRouter } from "./routes/auth.routes.js";

const app = express();
app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "startrack-api", time: new Date().toISOString() }));

// Routes
app.use("/api/auth", authRouter);

// Fallback 404 for unknown API routes
app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

async function start() {
  try {
    await connectDb();
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
