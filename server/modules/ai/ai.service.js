import { chat } from "#core/ai.js";
import {
  buildDashboardSummary, buildInventoryReport, buildSalesReport, buildCustomersReport, buildStaffReport,
} from "#modules/metrics/metrics.service.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";
import { AiAction } from "#modules/ai/aiAction.model.js";
import { TOOLS, resolveAction, describeAction } from "#modules/ai/aiActions.service.js";

const GROUND_RULE =
  "You are a plain-spoken business assistant for a small shop owner in Nigeria. " +
  "You are given real numbers from their own point-of-sale system as JSON. " +
  "Use ONLY the numbers given — never invent, estimate, or round a figure that " +
  "isn't already in the data. If the data doesn't answer the question, say so " +
  "plainly instead of guessing. Currency is Naira (₦). Keep it short and direct.";

/**
 * Everything the AI is allowed to see, in one place — today's dashboard,
 * stock, a 30-day sales trend with staff/category/payment breakdowns,
 * customer relationships, and staff performance. Every one of these is the
 * SAME builder function the human-facing report routes call (metrics.routes.js),
 * not a separate query — so the AI is grounded in exactly what an owner would
 * see clicking through the Dashboard's own tabs, nothing more and nothing
 * hand-rolled twice. Reused by both the digest and the chat below so "the
 * AI's view of the business" is defined once.
 *
 * Access is already business/branch/role-scoped for free: every builder
 * takes `ctx`, and `ctx` here is the CALLER's own tenant context (their
 * businessId/branchId/perms) — a branch-locked cashier's `ctx` restricts
 * these exactly as it restricts every other route, and canSeeCost(ctx)
 * inside buildDashboardSummary/buildSalesReport still hides profit/cost
 * fields from a role that isn't supposed to see them. The AI cannot see
 * more than the person asking it could see themselves.
 */
async function buildFullSnapshot(ctx) {
  const [dashboard, inventory, sales30d, customers, staff] = await Promise.all([
    buildDashboardSummary(ctx),
    buildInventoryReport(ctx),
    buildSalesReport(ctx, 30),
    buildCustomersReport(ctx),
    buildStaffReport(ctx),
  ]);
  return { dashboard, inventory, sales30d, customers, staff };
}

/**
 * The business-health digest: a short narrative built from the full
 * snapshot above. Read-only — no approval gate needed, since nothing here
 * writes anything.
 */
export async function generateDigest(ctx) {
  const snapshot = await buildFullSnapshot(ctx);
  const result = await chat({
    system: GROUND_RULE +
      " Write a short digest (120-180 words) covering: the headline trend, one risk worth flagging, " +
      "and one concrete, specific recommendation. Draw on whichever part of the data is most relevant — " +
      "sales, stock, customers or staff — not just the top-line revenue figure. No markdown headers, " +
      "no bullet points — plain prose, like a text message from a sharp accountant.",
    messages: [{ role: "user", content: `Here is this business's current snapshot:\n${JSON.stringify(snapshot)}` }],
  });
  if (!result.ok) return { enabled: true, ok: false, reason: result.reason };
  return { enabled: true, ok: true, narrative: result.text, generatedAt: new Date().toISOString() };
}

/**
 * "Ask AI" — grounds every answer in the full snapshot above (sales,
 * stock, customers, staff), so a question about any part of the business
 * has real data behind it instead of "I don't have that information."
 *
 * Also the ONLY place the AI can initiate a write: `tools` lets the model
 * choose to call one of aiActions.service.js's action schemas instead of
 * answering in text. A tool call NEVER executes anything here — it only
 * ever creates a pending AiAction row for a human to approve (ai.routes.js's
 * /actions/:id/approve, gated by the same permission the equivalent UI
 * action already requires). This function's job stops at resolving and
 * validating the proposal against real data (does that product exist, is a
 * branch selected) so the draft shown to the human is concrete, not at
 * making the change itself.
 */
export async function answerQuestion(ctx, question) {
  const dataUsed = await buildFullSnapshot(ctx);
  const result = await chat({
    system: GROUND_RULE +
      " Answer the owner's question directly, in 2-4 sentences. If they're asking you to DO something — " +
      "create a customer, add a product, adjust stock, record a sale, file a return, create a staff account, " +
      "log an expense — call the matching tool instead of just describing it in text. Only call a tool when " +
      "the request is clearly an instruction to act, not when they're merely asking about one of these topics.",
    messages: [{ role: "user", content: `Business data:\n${JSON.stringify(dataUsed)}\n\nMessage: ${question}` }],
    tools: TOOLS,
  });
  if (!result.ok) return { enabled: true, ok: false, reason: result.reason };

  if (result.toolCalls?.length) {
    const proposals = [];
    const problems = [];
    for (const call of result.toolCalls) {
      const type = call.function?.name;
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* treated as empty below */ }
      try {
        const payload = await resolveAction(ctx, type, args);
        const action = await AiAction.create({
          accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
          type, payload, reasoning: result.text || "", question,
          proposedById: ctx.userId, proposedByName: ctx.actorName,
        });
        proposals.push({ id: action._id, type, description: describeAction(type, payload) });
      } catch (err) {
        problems.push(err.message || "Couldn't draft that.");
      }
    }
    const parts = [];
    if (proposals.length) {
      parts.push(`I've drafted ${proposals.length === 1 ? "this" : "these"} for your approval:\n` + proposals.map((p) => `• ${p.description}`).join("\n"));
    }
    if (problems.length) parts.push(problems.join("\n"));
    return { enabled: true, ok: true, answer: parts.join("\n\n") || "I couldn't draft anything from that.", proposals };
  }

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
