import { Resend } from "resend";
import { config } from "#core/config.js";

/**
 * Outbound email — the one door every kind of email this app sends goes
 * through, whatever triggers it (today: the alerts digest; nothing stops the
 * next feature from being a receipt, an invite, or a password reset using
 * the exact same sendMail/emailShell pair). Configured through
 * RESEND_API_KEY; when it's absent the mailer stays off and says so once,
 * rather than pretending to send. Nothing in the app depends on mail
 * succeeding — alerts always land in the in-app bell first, and email is the
 * copy that follows.
 */
let client = null;
let warned = false;

function getClient() {
  if (client) return client;
  if (!config.resend.apiKey) {
    if (!warned) {
      warned = true;
      console.warn(
        "✉ Email is OFF — no RESEND_API_KEY configured.\n" +
          "  Set RESEND_API_KEY (from resend.com/api-keys) to turn it on.\n" +
          "  Alerts still appear in the app; only the email copy is skipped."
      );
    }
    return null;
  }
  client = new Resend(config.resend.apiKey);
  return client;
}

export const mailEnabled = () => !!config.resend.apiKey;

/**
 * Sends one message. Never throws — a mail provider having a bad day must
 * not take a checkout or a nightly sweep down with it.
 */
export async function sendMail({ to, subject, html, text }) {
  const resend = getClient();
  if (!resend || !to?.length) return { sent: false, reason: "not_configured" };
  try {
    const { error } = await resend.emails.send({
      from: config.resend.from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    });
    if (error) {
      console.error("✉ email failed:", error.message || error);
      return { sent: false, reason: error.message || "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("✉ email failed:", err.message);
    return { sent: false, reason: err.message };
  }
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const TONE = {
  critical: { bg: "#fee2e2", fg: "#dc2626", label: "Urgent" },
  warning: { bg: "#fef3c7", fg: "#d97706", label: "Attention" },
  info: { bg: "#e0e7ff", fg: "#1a48cc", label: "For your information" },
};

/**
 * The house email shell. Inline styles only and a table-free layout — mail
 * clients are not browsers, and the legacy app's flexbox email body silently
 * collapsed in Outlook.
 */
export function emailShell({ businessName, heading, intro, sections, footNote }) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f6f7f9;padding:24px">
  <div style="background:#1a48cc;padding:24px 28px;border-radius:12px 12px 0 0">
    <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.3px">${esc(businessName)}</div>
    <div style="color:rgba(255,255,255,.72);font-size:12px;margin-top:3px">via StarTrack</div>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <h1 style="font-size:19px;font-weight:800;color:#111827;margin:0 0 8px">${esc(heading)}</h1>
    ${intro ? `<p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 20px">${esc(intro)}</p>` : ""}
    ${sections.join("")}
    <div style="margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6">
        ${esc(footNote || "You are receiving this because your address is listed for alerts in Settings.")}
      </p>
    </div>
  </div>
</div>`;
}

/** One alert rendered as a row inside the shell. */
export function alertRow({ severity, title, body, meta }) {
  const tone = TONE[severity] || TONE.info;
  return `<div style="border:1px solid #e5e7eb;border-left:3px solid ${tone.fg};border-radius:8px;padding:14px 16px;margin-bottom:10px">
    <div style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;background:${tone.bg};color:${tone.fg};margin-bottom:8px">${tone.label}</div>
    <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:3px">${esc(title)}</div>
    ${body ? `<div style="font-size:13px;color:#4b5563;line-height:1.55">${esc(body)}</div>` : ""}
    ${meta ? `<div style="font-size:11px;color:#9ca3af;margin-top:6px">${esc(meta)}</div>` : ""}
  </div>`;
}
