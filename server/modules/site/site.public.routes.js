import { Router } from "express";
import { Business } from "#modules/business/business.model.js";
import { allow } from "#core/rateLimit.js";
import { publicView, SLUG_RE, siteOf } from "#modules/site/site.service.js";
import { businessHasFeature } from "#core/plan.js";
import { gateView, storeOf, storefrontEligible } from "#modules/storefront/store.service.js";

export const sitePublicRouter = Router();

/**
 * GET /api/public/sites/:slug — a business's public page. No login. Only
 * businesses whose owner switched the page on are visible; an unpublished or
 * unknown address is the same 404, so addresses can't be probed. The payload
 * comes from publicView(), which never includes cost, stock, customers or ids.
 */
sitePublicRouter.get("/:slug", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "x";
  if (!allow(res, `site:${ip}`, { max: 90, windowMs: 60_000 })) return;
  const slug = String(req.params.slug || "").toLowerCase();
  if (!SLUG_RE.test(slug)) return res.status(404).json({ error: "not_found", message: "This page doesn't exist." });
  const b = await Business.findOne({ "site.slug": slug });
  // A page only stays up while the account is on a plan that includes it.
  if (!b || !siteOf(b).enabled || !(await businessHasFeature(b, "sitePage"))) return res.status(404).json({ error: "not_found", message: "This page isn't available." });

  // Which door did they come through? A scan of the printed QR code carries ?src=qr.
  const inc = { "site.visits": 1 };
  if (req.query.src === "qr") inc["site.qrScans"] = 1;
  Business.updateOne({ _id: b._id }, { $inc: inc }).catch(() => {});

  // A business that runs an online store keeps its page behind registration:
  // a stranger sees who this is and a sign-in form, nothing else. The real page
  // (and its prices) is only sent to a signed-in customer — see
  // storefront.public.routes.js. Without a store the page is open as before.
  if (storeOf(b).enabled && storefrontEligible(b.typeKey)) {
    res.set("Cache-Control", "no-store");
    return res.json(gateView(b));
  }
  res.set("Cache-Control", "public, max-age=30");
  res.json(await publicView(b));
});
