import dotenv from "dotenv";
dotenv.config();

const isProd = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET || "dev-secret-change-me";

// Refuse to boot in production with the development secret — a silent
// default here would let anyone forge login tokens. Throwing rather than
// process.exit()-ing matters beyond style: this module loads on every cold
// start of the Netlify function too (server/app.js imports it transitively),
// and calling process.exit() there doesn't fail one request cleanly — it can
// tear down the whole serverless runtime mid-init, which is exactly the kind
// of thing that shows up client-side as a bare 502 with no useful message.
// A thrown error still stops a standalone server (server/index.js) from
// booting at all — Node exits non-zero on an uncaught exception during
// module evaluation either way — but the function's logs get an actual
// stack trace pointing at this line instead of a mystery crash.
if (isProd && jwtSecret === "dev-secret-change-me") {
  throw new Error("FATAL: set a real JWT_SECRET before running in production.");
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
  // Outbound email — every kind the app sends (alerts today, whatever comes
  // next) goes through Resend; see mailer.js. Absent RESEND_API_KEY = email
  // stays off and alerts stay in-app only, same fallback as before.
  resend: {
    apiKey: process.env.RESEND_API_KEY || "",
    // Resend's own shared testing address — works with no domain setup, but
    // can only send to the account's own verified email. Set MAIL_FROM to a
    // "Name <you@yourdomain.com>" address once a sending domain is verified
    // in the Resend dashboard.
    from: process.env.MAIL_FROM || "StarTrack <onboarding@resend.dev>",
  },
  // Outbound SMS — phone verification codes and (opt-in) gym renewal
  // reminders go through Termii; see server/core/sms.js. Absent
  // TERMII_API_KEY = SMS stays off, same graceful fallback as email above.
  termii: {
    apiKey: process.env.TERMII_API_KEY || "",
    senderId: process.env.TERMII_SENDER_ID || "StarTrack",
  },
  // Free-tier Groq API serving an open-weight model — see server/core/ai.js.
  // Absent GROQ_API_KEY = every AI feature reports itself unavailable rather
  // than erroring.
  groq: {
    apiKey: process.env.GROQ_API_KEY || "",
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  },
  // How often the background sweep looks for expiring stock and unattended
  // returns. Every 6 hours by default; 0 turns the sweep off entirely.
  alertSweepHours: process.env.ALERT_SWEEP_HOURS === undefined ? 6 : Number(process.env.ALERT_SWEEP_HOURS),
  // The email promoted to platform overseer on boot, so StarTrack always has
  // a way in without editing the database by hand.
  platformOwnerEmail: (process.env.PLATFORM_OWNER_EMAIL || "").trim().toLowerCase(),
  // Render's free tier spins a web service down after 15 minutes with no
  // inbound HTTP request — RENDER_EXTERNAL_URL is set automatically there,
  // so this needs no manual configuration on Render itself. PING_URL
  // overrides it for any other host that wants the same trick. Blank
  // (local dev, or a paid tier that never sleeps) = the ping never runs.
  keepAwakeUrl: (process.env.PING_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, ""),
  isProd,
};
