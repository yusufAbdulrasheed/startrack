import mongoose from "mongoose";
import { Membership } from "#modules/auth/membership.model.js";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { User } from "#modules/auth/user.model.js";
import { permsForRole } from "#modules/auth/auth.service.js";

const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

/**
 * Resolves the tenant context for every business-data request.
 * The account comes from the JWT ONLY. The active business/branch come from
 * headers, but are validated against the caller's membership — a client can
 * never reach a business or branch its membership doesn't grant.
 *
 * Attaches req.ctx = { userId, actorName, accountId, businessId, branchId,
 *                      role, perms, membership, allBranches }
 */
export async function tenantContext(req, res, next) {
  try {
    const businessId = oid(req.headers["x-business-id"]);
    const branchId = oid(req.headers["x-branch-id"]);
    if (!businessId) {
      return res.status(400).json({ error: "no_business", message: "Missing business context." });
    }

    const business = await Business.findOne({ _id: businessId, accountId: req.auth.accountId });
    if (!business) {
      return res.status(403).json({ error: "forbidden", message: "That business isn't on your account." });
    }

    // Prefer a membership scoped to this business; fall back to account-wide (owner).
    const membership =
      (await Membership.findOne({ userId: req.auth.userId, accountId: req.auth.accountId, businessId, status: "active" })) ||
      (await Membership.findOne({ userId: req.auth.userId, accountId: req.auth.accountId, businessId: null, status: "active" })) ||
      (await Membership.findOne({ userId: req.auth.userId, accountId: req.auth.accountId, role: "owner", status: "active" }));
    if (!membership) {
      return res.status(403).json({ error: "forbidden", message: "You don't have access to this business." });
    }

    const role = membership.role;
    const branchLocked = !!membership.branchId && (role === "manager" || role === "staff");

    let effectiveBranchId = branchId;
    if (branchLocked) {
      // Branch-scoped roles can only ever act in their own branch.
      effectiveBranchId = membership.branchId;
    }
    if (effectiveBranchId) {
      const branch = await Branch.findOne({ _id: effectiveBranchId, businessId });
      if (!branch) {
        return res.status(403).json({ error: "forbidden", message: "That branch doesn't belong to this business." });
      }
    }

    const user = await User.findById(req.auth.userId).select("name status");
    if (!user || user.status !== "active") {
      return res.status(401).json({ error: "unauthorized", message: "Please sign in again." });
    }

    req.ctx = {
      userId: membership.userId,
      actorName: user.name,
      accountId: business.accountId,
      businessId: business._id,
      branchId: effectiveBranchId || null,
      branchLocked,
      role,
      perms: permsForRole(role, membership.permsOverride || []),
      membership,
      business,
    };
    next();
  } catch (err) {
    console.error("tenantContext error:", err);
    res.status(500).json({ error: "server", message: "Could not resolve your business context." });
  }
}

// Route-level permission gate. Owner ("*") passes everything.
export function requirePerm(...perms) {
  return (req, res, next) => {
    const have = req.ctx?.perms || [];
    if (have.includes("*") || perms.some((p) => have.includes(p))) return next();
    return res.status(403).json({ error: "forbidden", message: "You don't have permission to do that." });
  };
}

// Requires an explicit branch context (most operational endpoints).
export function requireBranch(req, res, next) {
  if (!req.ctx.branchId) {
    return res.status(400).json({ error: "no_branch", message: "Select a branch first." });
  }
  next();
}

// Staff-safe projection: roles without the finance permission never receive
// cost/profit fields — enforced here at the data layer, not in the UI.
export function canSeeCost(ctx) {
  return ctx.perms.includes("*") || ctx.perms.includes("dashboard_finance") || ctx.perms.includes("costs");
}
