import jwt from "jsonwebtoken";
import { config } from "#core/config.js";
import { allow } from "#core/rateLimit.js";
import { Shopper } from "#modules/storefront/shopper.model.js";
import { loadStore } from "#modules/storefront/store.service.js";

/**
 * A shopper's session. Signed with a secret DERIVED from the app's, so a
 * shopper token can never verify as a staff token (and vice versa): there is no
 * path from "I registered on a shop's page" to "I can reach a dashboard".
 */
const secret = () => `${config.jwtSecret}::shopper`;

export const signShopperToken = (shopper) =>
  jwt.sign({ sub: String(shopper._id), bid: String(shopper.businessId), typ: "shopper" }, secret(), { expiresIn: "30d" });

function verifyShopperToken(token) {
  try {
    const p = jwt.verify(token, secret());
    return p.typ === "shopper" ? p : null;
  } catch {
    return null;
  }
}

/** First middleware on every store route: find the store, or 404 as one. */
export async function resolveStore(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "x";
  if (!allow(res, `store:${ip}`, { max: 240, windowMs: 60_000 })) return;
  const business = await loadStore(req.params.slug);
  if (!business) return res.status(404).json({ error: "not_found", message: "This store isn't available." });
  req.business = business;
  next();
}

/** Requires a signed-in shopper OF THIS STORE. A token from another shop is a stranger here. */
export async function requireShopper(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && verifyShopperToken(token);
  if (!payload || payload.bid !== String(req.business._id)) {
    return res.status(401).json({ error: "unauthorized", message: "Please sign in to continue." });
  }
  const shopper = await Shopper.findOne({ _id: payload.sub, businessId: req.business._id });
  if (!shopper || shopper.status !== "active") {
    return res.status(401).json({ error: "unauthorized", message: "Please sign in to continue." });
  }
  req.shopper = shopper;
  next();
}
