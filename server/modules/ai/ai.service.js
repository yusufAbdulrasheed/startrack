import { chat } from "#core/ai.js";
import { buildDashboardSummary, buildInventoryReport } from "#modules/metrics/metrics.service.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";

const GROUND_RULE =
  "You are a plain-spoken business assistant for a small shop owner in Nigeria. " +
  "You are given real numbers from their own point-of-sale system as JSON. " +
  "Use ONLY the numbers given — never invent, estimate, or round a figure that " +
  "isn't already in the data. If the data doesn't answer the question, say so " +
  "plainly instead of guessing. Currency is Naira (₦). Keep it short and direct.";

/**
 * The business-health digest: a short narrative built from the same
 * dashboard summary the Dashboard page itself shows. Read-only — no
 * approval gate needed, since nothing here writes anything.
 */
export async function generateDigest(ctx) {
  const summary = await buildDashboardSummary(ctx);
  const result = await chat({
    system: GROUND_RULE +
      " Write a short digest (120-180 words) covering: the headline trend, one risk worth flagging, " +
      "and one concrete, specific recommendation. No markdown headers, no bullet points — plain prose, " +
      "like a text message from a sharp accountant.",
    messages: [{ role: "user", content: `Here is this business's current snapshot:\n${JSON.stringify(summary)}` }],
  });
  if (!result.ok) return { enabled: true, ok: false, reason: result.reason };
  return { enabled: true, ok: true, narrative: result.text, generatedAt: new Date().toISOString() };
}

/**
 * "Ask AI" — grounds every answer in the same dashboard + inventory
 * snapshots, so the model is reasoning over real figures, not guessing.
 */
export async function answerQuestion(ctx, question) {
  const [dashboard, inventory] = await Promise.all([buildDashboardSummary(ctx), buildInventoryReport(ctx)]);
  const dataUsed = { dashboard, inventory };
  const result = await chat({
    system: GROUND_RULE + " Answer the owner's question directly, in 2-4 sentences.",
    messages: [{ role: "user", content: `Business data:\n${JSON.stringify(dataUsed)}\n\nQuestion: ${question}` }],
  });
  if (!result.ok) return { enabled: true, ok: false, reason: result.reason };
  return { enabled: true, ok: true, answer: result.text, dataUsed };
}

/**
 * Generates (or refreshes) restock suggestions for low/out-of-stock
 * products, using the same velocity data (flow30d/topMovers) the Inventory
 * report already computes. Writes ONLY RestockSuggestion rows — never
 * touches Product.reorderLevel or real stock; that only happens if/when the
 * owner explicitly approves one (see ai.routes.js's /approve).
 */
export async function generateRestockSuggestions(ctx) {
  const report = await buildInventoryReport(ctx);
  if (!report.lowStock.length) return { enabled: true, ok: true, count: 0 };

  const velocityByName = new Map(report.topMovers.map((m) => [m.name, m]));
  const candidates = report.lowStock.map((p) => ({
    productId: String(p.id), name: p.name, stock: p.stock, reorderLevel: p.reorderLevel,
    unitsOutLast30d: velocityByName.get(p.name)?.unitsOut ?? null,
  }));

  const result = await chat({
    system: GROUND_RULE +
      ' For each product, suggest a reorder quantity and a one-line reason, grounded in its sales ' +
      "velocity if given (units sold in the last 30 days) and its reorder level otherwise. " +
      'Respond with ONLY a JSON object of this exact shape, no other text: ' +
      '{"suggestions":[{"productId":"...","suggestedQty":0,"reasoning":"..."}]}',
    messages: [{ role: "user", content: `Low-stock products:\n${JSON.stringify(candidates)}` }],
    json: true,
  });
  if (!result.ok) return { enabled: true, ok: false, reason: result.reason };

  const suggestions = Array.isArray(result.data?.suggestions) ? result.data.suggestions : [];
  const byId = new Map(candidates.map((c) => [c.productId, c]));
  let count = 0;
  for (const s of suggestions) {
    const c = byId.get(String(s.productId));
    const qty = Math.round(Number(s.suggestedQty));
    if (!c || !Number.isFinite(qty) || qty <= 0) continue;
    await RestockSuggestion.findOneAndUpdate(
      { businessId: ctx.businessId, productId: c.productId, status: "pending" },
      {
        $set: {
          accountId: ctx.accountId, businessId: ctx.businessId, productId: c.productId, productName: c.name,
          currentStock: c.stock, reorderLevel: c.reorderLevel, suggestedQty: qty,
          reasoning: String(s.reasoning || "").slice(0, 300), generatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    count += 1;
  }
  return { enabled: true, ok: true, count };
}
