import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "#core/config.js";

export const hashPassword = (plain) => bcrypt.hash(plain, 10);
export const checkPassword = (plain, hash) => bcrypt.compare(plain, hash);

export function signToken(payload, opts = {}) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d", ...opts });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

// Default capabilities per role (per-user overrides are added on top).
// "costs" (see cost/profit on products) rides with dashboard_finance;
// managers can be granted it individually via permsOverride.
export const ROLE_PERMS = {
  owner: ["*"],
  admin: ["sales", "returns", "approve_returns", "void_sales", "stock", "prices", "expenses",
          "dashboard_ops", "dashboard_finance", "staff_mgmt", "settings", "customers", "activity", "audit", "support"],
  manager: ["sales", "returns", "approve_returns", "void_sales", "stock", "prices", "expenses",
            "dashboard_ops", "customers", "activity", "support"],
  staff: ["sales", "returns", "activity"],
};

// Every permission a person can be individually given. "*" (everything) is
// deliberately not here: only the owner role has it, and it can never be handed out.
export const GRANTABLE_PERMS = new Set([
  "activity", "approve_returns", "audit", "customers", "dashboard_finance", "dashboard_ops", "expenses",
  "prices", "returns", "sales", "settings", "staff_mgmt", "stock", "support", "void_sales",
]);

/** Why `wanted` can't be given to someone by `actorPerms`, or null if it can. */
export function overridesProblem(actorPerms, wanted) {
  if (wanted.some((p) => !GRANTABLE_PERMS.has(p))) return "That isn't a permission that can be given.";
  if (!actorPerms.includes("*") && wanted.some((p) => !actorPerms.includes(p))) return "You can't give someone a permission you don't have yourself.";
  return null;
}

export function permsForRole(role, overrides = []) {
  const base = ROLE_PERMS[role] || ROLE_PERMS.staff;
  // Filtered on the way out as well, so an override stored before this rule existed can't carry "*".
  return Array.from(new Set([...base, ...overrides.filter((p) => GRANTABLE_PERMS.has(p))]));
}
