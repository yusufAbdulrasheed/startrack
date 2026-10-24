import { Router } from "express";
import { Business } from "#modules/business/business.model.js";
import { rateLimit } from "#core/rateLimit.js";
import { publicView, SLUG_RE, siteOf } from "#modules/site/site.service.js";
import { businessHasFeature } from "#core/plan.js";

export const sitePublicRouter = Router();

/**
 * GET /api/public/sites/:slug — a business's public page. No login. Only
 * businesses whose owner switched the page on are visible; an unpublished or
 * unknown address is the same 404, so addresses can't be probed. The payload
 * comes from publicView(), which never includes cost, stock, customers or ids.
 */
sitePublicRouter.get("/:slug", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "x";
  if (!rateLimit(`site:${ip}`, { max: 90, windowMs: 60_000 })) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Try again shortly." });
  }
  const slug = String(req.params.slug || "").toLowerCase();
  if (!SLUG_RE.test(slug)) return res.status(404).json({ error: "not_found", message: "This page doesn't exist." });
  const b = await Business.findOne({ "site.slug": slug });
  // A page only stays up while the account is on a plan that includes it.
  if (!b || !siteOf(b).enabled || !(await businessHasFeature(b, "sitePage"))) return res.status(404).json({ error: "not_found", message: "This page isn't available." });
  res.set("Cache-Control", "public, max-age=30");
  res.json(await publicView(b));
});
