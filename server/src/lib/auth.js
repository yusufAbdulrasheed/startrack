import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

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
          "dashboard_ops", "dashboard_finance", "staff_mgmt", "settings", "customers", "activity", "audit"],
  manager: ["sales", "returns", "approve_returns", "void_sales", "stock", "prices", "expenses",
            "dashboard_ops", "customers", "activity"],
  staff: ["sales", "returns", "activity"],
};

export function permsForRole(role, overrides = []) {
  const base = ROLE_PERMS[role] || ROLE_PERMS.staff;
  return Array.from(new Set([...base, ...overrides]));
}
