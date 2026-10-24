import { Router } from "express";
import { z } from "zod";
import { aiEnabled } from "#core/ai.js";
import { generateDigest, answerQuestion, answerInModule, generateRestockSuggestions } from "#modules/ai/ai.service.js";
import { MODULES, canUseModule } from "#modules/ai/domain/modules.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";
import { AiAction } from "#modules/ai/aiAction.model.js";
import { AiChat } from "#modules/ai/chat.model.js";
import mongoose from "mongoose";
import multer from "multer";
import { answerWithFile } from "#modules/imports/importAssistant.js";
import { buildTemplate } from "#modules/imports/template.js";
import { MAX_FILE_BYTES } from "#modules/imports/parseSheet.js";
import { ACTION_PERM, executeAction, describeAction } from "#modules/ai/aiActions.service.js";
import { Product } from "#modules/products/product.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { audit } from "#core/audit.js";
import { rateLimit } from "#core/rateLimit.js";
import { notFound, conflict, badRequest, HttpError } from "#core/httpError.js";

export const aiRouter = Router();

const can = (ctx, ...perms) => ctx.perms.includes("*") || perms.some((p) => ctx.perms.includes(p));

function shapeSuggestion(s) {
  return {
    id: s._id, productId: s.productId, productName: s.productName,
    currentStock: s.currentStock, reorderLevel: s.reorderLevel, suggestedQty: s.suggestedQty,
    reasoning: s.reasoning, status: s.status, generatedAt: s.generatedAt,
    decidedByName: s.decidedByName, decidedAt: s.decidedAt, appliedAs: s.appliedAs,
  };
}

// GET /api/ai/digest
aiRouter.get("/digest", requirePerm("dashboard_ops"), async (req, res) => {
  if (!aiEnabled()) return res.json({ enabled: false });
  res.json(await generateDigest(req.ctx));
});

const chatSchema = z.object({ question: z.string().min(3, "Ask a real question").max(500) });

// POST /api/ai/chat
aiRouter.post("/chat", requirePerm("dashboard_ops"), async (req, res) => {
  if (!aiEnabled()) return res.json({ enabled: false });
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  res.json(await answerQuestion(req.ctx, parsed.data.question));
});

const moduleChatSchema = z.object({
  module: z.string().max(40).default(""),
  question: z.string().min(3, "Ask a real question").max(500),
  history: z.array(z.object({ q: z.string().max(500), a: z.string().max(2000) })).max(6).default([]),
  chatId: z.string().optional(), // continue a saved conversation
});

// POST /api/ai/module — the assistant that follows you from screen to screen.
// `module` is the route segment under /app/ (e.g. "front-desk"). Each known
// module is gated by the SAME permission its page needs; anything else
// (dashboard, home…) gets the whole-business view, which needs dashboard_ops.
aiRouter.post("/module", async (req, res) => {
  if (!aiEnabled()) return res.json({ enabled: false });
  const parsed = moduleChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { module, question, history, chatId } = parsed.data;

  // A screen with its own builder needs that screen's permission. Anything else
  // (dashboard, Ask AI…) is open to anyone who can use the app at all — people
  // without dashboard rights get their own staff hub view (see answerInModule),
  // so the assistant is there for every kind of user, never a dead end.
  const allowed = MODULES[module] ? canUseModule(req.ctx, module) : can(req.ctx, "dashboard_ops", "activity");
  if (!allowed) return res.status(403).json({ error: "forbidden", message: "You don't have access to that part of the business." });

  // The model provider meters one shared quota for the whole platform, so
  // fair use is capped per person and per business.
  if (!rateLimit(`ai:u:${req.ctx.userId}`, { max: 40, windowMs: 60 * 60 * 1000 }) ||
      !rateLimit(`ai:b:${req.ctx.businessId}`, { max: 200, windowMs: 60 * 60 * 1000 })) {
    return res.status(429).json({ error: "rate_limited", message: "You've asked a lot in the last hour — give it a little while and try again." });
  }

  const result = await answerInModule(req.ctx, { module, question, history });

  // Save the exchange. A failure to save must never cost the person their
  // answer, so it is logged and the reply goes out regardless.
  if (result?.ok && result.answer) {
    try {
      const saved = await saveTurn(req.ctx, { chatId, module, question, result });
      result.chatId = String(saved._id);
      result.title = saved.title;
    } catch (err) {
      console.error("ai chat save failed:", err.message);
    }
  }
  res.json(result);
});

// ── Files ─────────────────────────────────────────────────────────────
// POST /api/ai/upload — a spreadsheet attached to a chat message. Reads it and
// drafts an import for approval; nothing is created here (see
// modules/imports/importAssistant.js). Works with or without the AI configured:
// the model only helps match unusual column names.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

aiRouter.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "too_large", message: "That file is over 5 MB. Split it into smaller files." });
    if (err) return res.status(400).json({ error: "invalid", message: "Couldn't read that upload." });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "invalid", message: "Attach an Excel or CSV file." });
  if (!rateLimit(`ai:up:${req.ctx.userId}`, { max: 30, windowMs: 60 * 60 * 1000 })) {
    return res.status(429).json({ error: "rate_limited", message: "You've uploaded a lot in the last hour — give it a little while and try again." });
  }
  const question = String(req.body?.question || "").slice(0, 500);
  const module = String(req.body?.module || "").slice(0, 40);
  const chatId = req.body?.chatId;

  const result = await answerWithFile(req.ctx, { file: req.file, question, module });
  try {
    const saved = await saveTurn(req.ctx, { chatId, module, question: question || `Import ${req.file.originalname}`, result });
    result.chatId = String(saved._id);
    result.title = saved.title;
  } catch (err) {
    console.error("ai chat save failed:", err.message);
  }
  res.json(result);
});

// GET /api/ai/import-template?target=products — a ready-to-fill file for this trade
aiRouter.get("/import-template", async (req, res) => {
  const t = await buildTemplate(req.ctx, String(req.query.target || ""));
  if (!t) return res.status(403).json({ error: "forbidden", message: "You don't have permission to import lists." });
  res.set({
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${t.filename}"`,
    "Content-Length": t.buffer.length,
    "Cache-Control": "no-store",
  });
  res.send(t.buffer);
});

// ── Chat history ──────────────────────────────────────────────────────
// Private to the person who had the conversation, within one business.

const MAX_CHATS = 200; // per person per business; the oldest fall off
const MAX_TURNS = 100; // per conversation

const mine = (ctx) => ({ businessId: ctx.businessId, userId: ctx.userId });
const chatTitle = (q) => {
  const t = q.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

async function saveTurn(ctx, { chatId, module, question, result }) {
  const turn = {
    question,
    answer: result.answer,
    proposals: (result.proposals || []).map((p) => ({ id: p.id, type: p.type, description: p.description })),
    reports: (result.reports || []).map((r) => ({ kind: r.kind, days: r.days ?? null, title: r.title })),
    files: result.files || [],
    imports: (result.imports || []).map(({ sample, duplicates, issues, ...rest }) => ({ ...rest, sample: (sample || []).slice(0, 8), duplicates: (duplicates || []).slice(0, 40), issues: (issues || []).slice(0, 40) })),
    at: new Date(),
  };

  if (chatId && mongoose.isValidObjectId(chatId)) {
    const chat = await AiChat.findOne({ _id: chatId, ...mine(ctx) });
    if (chat && chat.turns.length < MAX_TURNS) {
      chat.turns.push(turn);
      await chat.save();
      return chat;
    }
  }

  const chat = await AiChat.create({
    accountId: ctx.accountId,
    ...mine(ctx),
    module,
    title: chatTitle(question),
    turns: [turn],
  });

  // Keep the list bounded: drop whatever is beyond the newest MAX_CHATS.
  const stale = await AiChat.find(mine(ctx)).sort({ updatedAt: -1 }).skip(MAX_CHATS).select("_id");
  if (stale.length) await AiChat.deleteMany({ _id: { $in: stale.map((c) => c._id) } });
  return chat;
}

// GET /api/ai/chats — newest first
aiRouter.get("/chats", async (req, res) => {
  const chats = await AiChat.find(mine(req.ctx)).sort({ updatedAt: -1 }).limit(MAX_CHATS).select("module title updatedAt createdAt turns");
  res.json({
    chats: chats.map((c) => ({
      id: c._id, module: c.module, title: c.title, turns: c.turns.length,
      preview: c.turns[c.turns.length - 1]?.answer?.slice(0, 120) || "",
      updatedAt: c.updatedAt, createdAt: c.createdAt,
    })),
  });
});

// GET /api/ai/chats/:id — the whole conversation, proposals with their live status
aiRouter.get("/chats/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "not_found", message: "Chat not found." });
  const chat = await AiChat.findOne({ _id: req.params.id, ...mine(req.ctx) });
  if (!chat) return res.status(404).json({ error: "not_found", message: "Chat not found." });

  const importIds = chat.turns.flatMap((t) => (t.imports || []).map((i) => i.actionId).filter(Boolean));
  const importActions = importIds.length ? await AiAction.find({ _id: { $in: importIds }, businessId: req.ctx.businessId }).select("status resultRef error") : [];
  const importBy = new Map(importActions.map((a) => [String(a._id), a]));
  const ids = chat.turns.flatMap((t) => t.proposals.map((p) => p.id));
  const actions = ids.length ? await AiAction.find({ _id: { $in: ids }, businessId: req.ctx.businessId }).select("status error") : [];
  const byId = new Map(actions.map((a) => [String(a._id), a]));

  res.json({
    chat: {
      id: chat._id, module: chat.module, title: chat.title,
      turns: chat.turns.map((t) => ({
        question: t.question,
        answer: t.answer,
        at: t.at,
        reports: (t.reports || []).map((r) => ({ kind: r.kind, days: r.days, title: r.title, formats: ["pdf", "xlsx"] })),
        files: (t.files || []).map((f) => ({ name: f.name, size: f.size })),
        imports: (t.imports || []).map((i) => {
          if (!i.actionId) return i;
          const a = importBy.get(String(i.actionId));
          return { ...i, status: a?.status || "rejected", result: a?.status === "approved" ? a.resultRef?.label || "" : "", error: a?.status === "pending" ? a.error || "" : "" };
        }),
        proposals: t.proposals.map((p) => {
          const a = byId.get(String(p.id));
          return { id: String(p.id), type: p.type, description: p.description, status: a?.status || "rejected", error: a?.status === "pending" ? a.error || undefined : undefined };
        }),
      })),
    },
  });
});

// PATCH /api/ai/chats/:id — rename
aiRouter.patch("/chats/:id", async (req, res) => {
  const parsed = z.object({ title: z.string().trim().min(1).max(90) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: "Give the chat a name." });
  const chat = await AiChat.findOneAndUpdate({ _id: req.params.id, ...mine(req.ctx) }, { title: parsed.data.title }, { new: true });
  if (!chat) return res.status(404).json({ error: "not_found", message: "Chat not found." });
  res.json({ chat: { id: chat._id, title: chat.title } });
});

// DELETE /api/ai/chats/:id, and DELETE /api/ai/chats to clear them all
aiRouter.delete("/chats/:id", async (req, res) => {
  const r = await AiChat.deleteOne({ _id: req.params.id, ...mine(req.ctx) });
  if (!r.deletedCount) return res.status(404).json({ error: "not_found", message: "Chat not found." });
  res.json({ ok: true });
});
aiRouter.delete("/chats", async (req, res) => {
  const r = await AiChat.deleteMany(mine(req.ctx));
  res.json({ ok: true, deleted: r.deletedCount });
});

// GET /api/ai/restock-suggestions?status=pending
aiRouter.get("/restock-suggestions", requirePerm("stock"), async (req, res) => {
  const status = ["pending", "approved", "dismissed"].includes(req.query.status) ? req.query.status : "pending";
  const suggestions = await RestockSuggestion.find({ businessId: req.ctx.businessId, status }).sort({ generatedAt: -1 }).limit(50);
  res.json({ enabled: aiEnabled(), suggestions: suggestions.map(shapeSuggestion) });
});

// POST /api/ai/restock-suggestions/generate
aiRouter.post("/restock-suggestions/generate", requirePerm("stock"), async (req, res) => {
  if (!aiEnabled()) return res.json({ enabled: false });
  const result = await generateRestockSuggestions(req.ctx);
  if (result.ok) audit(req.ctx, "ai.restock.generate", { type: "ai", label: "Restock suggestions" }, undefined, { count: result.count });
  res.json(result);
});

const approveSchema = z.object({
  action: z.enum(["raise_reorder_level", "log_stock_in"]),
  qty: z.number().int().positive().optional(),
});

// POST /api/ai/restock-suggestions/:id/approve — the ONLY write in this
// whole phase, and only after this explicit owner action.
aiRouter.post("/restock-suggestions/:id/approve", requirePerm("stock"), requireBranch, async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  try {
    const suggestion = await RestockSuggestion.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
    if (!suggestion) throw notFound("Suggestion not found.");
    if (suggestion.status !== "pending") throw conflict("This suggestion was already decided.", "already_decided");

    const product = await Product.findOne({ _id: suggestion.productId, businessId: req.ctx.businessId });
    if (!product) throw badRequest("That product no longer exists.");

    if (d.action === "raise_reorder_level") {
      product.reorderLevel = d.qty ?? suggestion.suggestedQty;
      await product.save();
    } else {
      const qty = d.qty ?? suggestion.suggestedQty;
      await applyMovement(req.ctx, {
        branchId: req.ctx.branchId, productId: product._id, productName: product.name,
        type: "IN", qty, refType: "ai_restock", reason: "AI restock suggestion approved",
      });
    }

    suggestion.status = "approved";
    suggestion.decidedById = req.ctx.userId;
    suggestion.decidedByName = req.ctx.actorName;
    suggestion.decidedAt = new Date();
    suggestion.appliedAs = d.action === "raise_reorder_level" ? "reorder_level" : "stock_in";
    await suggestion.save();

    audit(req.ctx, "ai.restock.approve", { type: "product", id: product._id, label: product.name }, undefined, {
      action: d.action, qty: d.qty ?? suggestion.suggestedQty,
    });
    res.json({ suggestion: shapeSuggestion(suggestion) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }
});

// POST /api/ai/restock-suggestions/:id/dismiss
aiRouter.post("/restock-suggestions/:id/dismiss", requirePerm("stock"), async (req, res) => {
  const suggestion = await RestockSuggestion.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!suggestion) return res.status(404).json({ error: "not_found", message: "Suggestion not found." });
  if (suggestion.status === "pending") {
    suggestion.status = "dismissed";
    suggestion.decidedById = req.ctx.userId;
    suggestion.decidedByName = req.ctx.actorName;
    suggestion.decidedAt = new Date();
    await suggestion.save();
  }
  res.json({ suggestion: shapeSuggestion(suggestion) });
});

// ── AI Actions — proposals from "Ask AI" (server/modules/ai/aiActions.service.js) ──
// Nothing here ever writes real data except the /approve route below, and
// only after it re-checks the SAME permission the equivalent manual action
// would require — proposing something is never a permission bypass.

function shapeActionRow(a) {
  return {
    id: a._id, type: a.type,
    // An import carries hundreds of rows; the list only needs to know what it is.
    payload: a.type === "import_catalog" ? { target: a.payload.target, fileName: a.payload.fileName, counts: a.payload.counts } : a.payload,
    description: describeAction(a.type, a.payload),
    reasoning: a.reasoning, question: a.question, status: a.status,
    proposedByName: a.proposedByName, decidedByName: a.decidedByName, decidedAt: a.decidedAt,
    resultRef: a.resultRef, error: a.error, createdAt: a.createdAt,
  };
}

// GET /api/ai/actions?status=pending — anyone who can chat with the AI can
// see what it's proposed; approving a specific one still needs that
// action's own domain permission (checked below).
aiRouter.get("/actions", requirePerm("dashboard_ops"), async (req, res) => {
  const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "pending";
  const actions = await AiAction.find({ businessId: req.ctx.businessId, status }).sort({ createdAt: -1 }).limit(50);
  res.json({ actions: actions.map(shapeActionRow) });
});

// POST /api/ai/actions/:id/approve
aiRouter.post("/actions/:id/approve", requirePerm("dashboard_ops"), requireBranch, async (req, res) => {
  try {
    const action = await AiAction.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
    if (!action) throw notFound("That proposal no longer exists.");
    if (action.status !== "pending") throw conflict("This was already decided.", "already_decided");

    const requiredPerm = ACTION_PERM[action.type];
    if (!req.ctx.perms.includes("*") && !req.ctx.perms.includes(requiredPerm)) {
      throw new HttpError(403, "forbidden", "You don't have permission to approve this kind of action.");
    }
    // Highest-risk category — confirmed by the user's own design decision:
    // staff/permission changes always require the owner specifically, no
    // exceptions, regardless of who else holds the staff_mgmt permission.
    if (action.type === "create_staff" && !req.ctx.perms.includes("*")) {
      throw new HttpError(403, "forbidden", "Only the owner can approve creating a staff account.");
    }

    let resultRef;
    try {
      resultRef = await executeAction(req.ctx, action);
    } catch (err) {
      action.error = err instanceof HttpError ? err.message : "Couldn't complete this action.";
      await action.save();
      throw err instanceof HttpError ? err : new HttpError(500, "server", "Couldn't complete this action.");
    }

    action.status = "approved";
    action.decidedById = req.ctx.userId;
    action.decidedByName = req.ctx.actorName;
    action.decidedAt = new Date();
    action.resultRef = resultRef;
    action.error = "";
    await action.save();

    audit(req.ctx, `ai.action.approve.${action.type}`, resultRef, undefined,
      action.type === "import_catalog" ? { target: action.payload.target, fileName: action.payload.fileName, added: resultRef.count, skipped: resultRef.skipped } : { payload: action.payload });
    res.json({ action: shapeActionRow(action) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    throw err;
  }
});

// POST /api/ai/actions/:id/reject
aiRouter.post("/actions/:id/reject", requirePerm("dashboard_ops"), async (req, res) => {
  const action = await AiAction.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!action) return res.status(404).json({ error: "not_found", message: "That proposal no longer exists." });
  if (action.status === "pending") {
    action.status = "rejected";
    action.decidedById = req.ctx.userId;
    action.decidedByName = req.ctx.actorName;
    action.decidedAt = new Date();
    await action.save();
  }
  res.json({ action: shapeActionRow(action) });
});
