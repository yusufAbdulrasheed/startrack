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
  // Empty by default: this process serves the web client itself, so requests
  // are same-origin and CORS is unnecessary. Set WEB_ORIGIN (comma-separated)
  // only if the client is ever hosted somewhere else again.
  webOrigins: (process.env.WEB_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  // Outbound email for alerts. Absent = alerts stay in-app only (see mailer.js).
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "alerts@startrack.app",
  },
  // How often the background sweep looks for expiring stock and unattended
  // returns. Every 6 hours by default; 0 turns the sweep off entirely.
  alertSweepHours: process.env.ALERT_SWEEP_HOURS === undefined ? 6 : Number(process.env.ALERT_SWEEP_HOURS),
  // The email promoted to platform overseer on boot, so StarTrack always has
  // a way in without editing the database by hand.
  platformOwnerEmail: (process.env.PLATFORM_OWNER_EMAIL || "").trim().toLowerCase(),
  isProd,
};
