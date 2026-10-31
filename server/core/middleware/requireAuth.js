import { verifyToken } from "#modules/auth/auth.service.js";
import { Account } from "#modules/auth/account.model.js";
import { User } from "#modules/auth/user.model.js";
import { Membership } from "#modules/auth/membership.model.js";

// Verifies the Bearer token and attaches req.auth = { userId, accountId }.
// Tenant scoping for later endpoints derives from here — never from the body.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = token && verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "unauthorized", message: "Please sign in again." });
  }
  // `mode` is "till" for a business-code + PIN session (see /auth/till) and
  // absent for a normal email login — carried so /auth/me can report it.
  req.auth = { userId: payload.sub, accountId: payload.accountId, mode: payload.mode };
  next();
}

// ── account-level gates, for routes that are about the account not one business ──
// (Business routes get the same checks inside tenantContext.)

/** Refuses a suspended account or user, whatever token they still hold. */
export async function requireLive(req, res, next) {
  const [account, user] = await Promise.all([
    Account.findById(req.auth.accountId).select("status"),
    User.findById(req.auth.userId).select("status"),
  ]);
  if (!account || !user || account.status === "suspended" || user.status !== "active") {
    return res.status(403).json({ error: "account_suspended", message: "This account is suspended. Please contact support." });
  }
  next();
}

/** Only the account's owner: billing and plan changes are theirs alone. */
export async function requireOwner(req, res, next) {
  const owner = await Membership.exists({ userId: req.auth.userId, accountId: req.auth.accountId, role: "owner", status: "active" });
  if (!owner) return res.status(403).json({ error: "forbidden", message: "Only the account owner can do that." });
  next();
}
