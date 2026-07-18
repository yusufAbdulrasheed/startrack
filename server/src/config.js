import dotenv from "dotenv";
dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";

// Refuse to boot in production with the development secret — a silent
// default here would let anyone forge login tokens.
if (isProd && jwtSecret === "dev-secret-change-me") {
  console.error("FATAL: set a real JWT_SECRET before running in production.");
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || "", // blank → in-memory dev DB
  jwtSecret,
  // Comma-separated list of allowed web origins (local dev + deployed app).
  webOrigins: (process.env.WEB_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  isProd,
};
