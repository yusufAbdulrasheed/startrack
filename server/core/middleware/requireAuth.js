import { verifyToken } from "#modules/auth/auth.service.js";

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
