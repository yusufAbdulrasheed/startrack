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
 * (used by the restock-suggestion generator). `tools` (OpenAI-style
 * function-calling schemas) lets the model propose calling one instead of
 * answering in text — see server/modules/ai/aiActions.service.js, the only
 * caller that ever passes this. Returns `{ text, data?, toolCalls? }` —
 * `data` is the parsed object when `json` was requested and parsing
 * succeeded; `toolCalls` is the model's chosen tool invocations, if any.
 * Never throws; callers check `.ok`.
 */
export async function chat({ system, messages = [], json = false, tools = undefined, temperature = 0.3 }) {
  if (!config.groq.apiKey) {
    warnOnce();
    return { ok: false, reason: "not_configured" };
  }
  try {
    const payload = JSON.stringify({
      model: config.groq.model,
      temperature,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
      ...(json ? { response_format: { type: "json_object" } } : {}),
      ...(tools ? { tools, tool_choice: "auto" } : {}),
    });
    const send = () => fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.groq.apiKey}` },
      body: payload,
    });

    let res = await send();
    let body = await res.json().catch(() => ({}));

    // The provider meters tokens per minute across the WHOLE account, so with
    // many businesses sharing one key a request can be turned away for a few
    // seconds. A short wait is worth riding out once; a long one isn't —
    // report "busy" so the person sees a clear message instead of hanging.
    if (res.status === 429) {
      const hint = /try again in ([\d.]+)\s*(ms|s)/i.exec(body?.error?.message || "");
      const waitMs = hint ? Math.ceil(Number(hint[1]) * (hint[2].toLowerCase() === "ms" ? 1 : 1000)) + 300 : 4000;
      if (waitMs <= 9000) {
        await new Promise((r) => setTimeout(r, waitMs));
        res = await send();
        body = await res.json().catch(() => ({}));
      }
      if (res.status === 429) {
        console.warn("✦ AI is rate-limited:", body?.error?.message);
        return { ok: false, reason: "busy" };
      }
    }
    if (!res.ok) {
      console.error("✦ AI request failed:", body?.error?.message || res.statusText);
      return { ok: false, reason: body?.error?.message || "request_failed" };
    }
    const message = body?.choices?.[0]?.message || {};
    const text = message.content || "";
    const toolCalls = message.tool_calls?.length ? message.tool_calls : undefined;
    if (toolCalls) return { ok: true, text, toolCalls };
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
