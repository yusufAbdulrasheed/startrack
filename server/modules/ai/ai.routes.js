import { Router } from "express";
import { z } from "zod";
import { aiEnabled } from "#core/ai.js";
import { generateDigest, answerQuestion, generateRestockSuggestions } from "#modules/ai/ai.service.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";
import { AiAction } from "#modules/ai/aiAction.model.js";
import { ACTION_PERM, executeAction, describeAction } from "#modules/ai/aiActions.service.js";
import { Product } from "#modules/products/product.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { audit } from "#core/audit.js";
import { notFound, conflict, badRequest, HttpError } from "#core/httpError.js";

export const aiRouter = Router();

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
    id: a._id, type: a.type, payload: a.payload, description: describeAction(a.type, a.payload),
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

    audit(req.ctx, `ai.action.approve.${action.type}`, resultRef, undefined, { payload: action.payload });
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
