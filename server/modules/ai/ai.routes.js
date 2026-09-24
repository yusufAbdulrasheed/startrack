import { Router } from "express";
import { z } from "zod";
import { aiEnabled } from "#core/ai.js";
import { generateDigest, answerQuestion, generateRestockSuggestions } from "#modules/ai/ai.service.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";
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
