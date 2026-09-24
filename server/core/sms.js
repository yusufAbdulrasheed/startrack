import { config } from "#core/config.js";

/**
 * Outbound SMS via Termii — phone verification codes today, opt-in gym
 * renewal reminders later. Same shape as mailer.js: configured through
 * TERMII_API_KEY, stays off and says so once when absent, never throws —
 * nothing in the app may depend on an SMS actually landing.
 *
 * NOTE: verify this request/response shape against Termii's current docs
 * before relying on it in production — API surfaces like this drift.
 */
let warned = false;

export const smsEnabled = () => !!config.termii.apiKey;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "✆ SMS is OFF — no TERMII_API_KEY configured.\n" +
      "  Set TERMII_API_KEY (from termii.com) to turn it on.\n" +
      "  Phone verification codes and gym SMS reminders are skipped until then."
  );
}

/**
 * Sends one text message. Never throws — a provider having a bad day must
 * not take a checkout or a verification request down with it.
 */
export async function sendSms({ to, message }) {
  if (!config.termii.apiKey || !to) {
    warnOnce();
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.ng.termii.com/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.termii.apiKey,
        to,
        from: config.termii.senderId,
        sms: message,
        type: "plain",
        channel: "generic",
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("✆ sms failed:", body?.message || res.statusText);
      return { sent: false, reason: body?.message || "send_failed" };
    }
    return { sent: true };
  } catch (err) {
    console.error("✆ sms failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
