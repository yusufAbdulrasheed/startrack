import { Router } from "express";
import { LoyaltyCard } from "#modules/loyalty/loyaltyCard.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Business } from "#modules/business/business.model.js";
import { rateLimit } from "#core/rateLimit.js";

export const loyaltyCardPublicRouter = Router();

/**
 * GET /api/public/loyalty-cards/:code — the WhatsApp-share / "open directly"
 * case. No auth (a customer isn't logged into anything), so the payload is
 * deliberately minimal — first name and business name only, never the
 * discount rule or any other customer data — and rate-limited by code so it
 * can't be used to enumerate cards.
 */
loyaltyCardPublicRouter.get("/:code", async (req, res) => {
  const code = req.params.code;
  if (!rateLimit(`loyaltycard:${code}`, { max: 20, windowMs: 60_000 })) {
    return res.status(429).json({ error: "rate_limited", message: "Too many requests. Try again shortly." });
  }

  const card = await LoyaltyCard.findOne({ code, status: "active" });
  if (!card) return res.status(404).json({ error: "not_found", message: "This loyalty card isn't valid." });

  const [customer, business] = await Promise.all([
    Customer.findById(card.customerId).select("name"),
    Business.findById(card.businessId).select("name"),
  ]);
  if (!customer || !business) return res.status(404).json({ error: "not_found", message: "This loyalty card isn't valid." });

  res.json({
    code: card.code,
    firstName: customer.name.split(" ")[0],
    businessName: business.name,
  });
});
