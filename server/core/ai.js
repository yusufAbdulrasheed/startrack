import { config } from "#core/config.js";

/**
 * Groq's free-tier API, serving open-weight models (Llama 3.3 by default) —
 * "free and open source AI model" in practice: the model itself is
 * open-weight, Groq just hosts the inference so nothing needs self-hosting
 * on top of this app's existing Render/Netlify deployment. Same shape as
 * mailer.js/sms.js: configured through GROQ_API_KEY, stays off and says so
 * once when absent, never throws — every AI feature must degrade to
 * "unavailable" rather than crash a request.
 *
 * Groq's API is OpenAI-compatible, so a direct fetch is enough — no SDK.
 */
let warned = false;

export const aiEnabled = () => !!config.groq.apiKey;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "✦ AI features are OFF — no GROQ_API_KEY configured.\n" +
      "  Get a free key at console.groq.com/keys and set GROQ_API_KEY to turn them on."
  );
}

/**
 * One chat completion. `system` sets the ground rules (e.g. "use only the
 * numbers given, never invent figures"), `messages` is the rest of the
 * conversation, `json:true` asks Groq to return a parseable JSON object
 * (used by the restock-suggestion generator). Returns `{ text, data? }` —
 * `data` is the parsed object when `json` was requested and parsing
 * succeeded. Never throws; callers check `.ok`.
 */
export async function chat({ system, messages = [], json = false, temperature = 0.3 }) {
  if (!config.groq.apiKey) {
    warnOnce();
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groq.apiKey}` },
      body: JSON.stringify({
        model: config.groq.model,
        temperature,
        messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("✦ AI request failed:", body?.error?.message || res.statusText);
      return { ok: false, reason: body?.error?.message || "request_failed" };
    }
    const text = body?.choices?.[0]?.message?.content || "";
    if (!json) return { ok: true, text };
    try {
      return { ok: true, text, data: JSON.parse(text) };
    } catch {
      return { ok: false, reason: "bad_json" };
    }
  } catch (err) {
    console.error("✦ AI request failed:", err.message);
    return { ok: false, reason: err.message };
  }
}
