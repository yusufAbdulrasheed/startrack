import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { Account } from "../models/Account.js";
import { Business } from "../models/Business.js";
import { Branch } from "../models/Branch.js";
import { Membership } from "../models/Membership.js";
import { hashPassword, checkPassword, signToken, permsForRole } from "../lib/auth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { typeTemplate } from "../lib/businessTypes.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  businessName: z.string().min(2, "Enter your business name"),
  businessType: z.string().default("retail"),
  currency: z.string().default("₦"),
  branchName: z.string().default("Main Branch"),
});

// POST /api/auth/register — creates user + account + business + branch + owner membership
authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  }
  const d = parsed.data;

  if (await User.findOne({ email: d.email })) {
    return res.status(409).json({ error: "email_taken", message: "That email is already registered." });
  }

  // Sequential creation with best-effort cleanup on failure.
  // (Atlas/replica-set deployment will wrap this in a transaction.)
  const created = {};
  try {
    created.user = await User.create({ name: d.name, email: d.email, passwordHash: await hashPassword(d.password) });
    created.account = await Account.create({ name: d.businessName, ownerUserId: created.user._id });
    created.business = await Business.create({
      accountId: created.account._id,
      name: d.businessName,
      typeKey: d.businessType,
      // The business type provisions its defaults (blueprint: type = template).
      settings: { currency: d.currency, modules: typeTemplate(d.businessType).modules },
    });
    created.branch = await Branch.create({
      accountId: created.account._id,
      businessId: created.business._id,
      name: d.branchName,
    });
    created.membership = await Membership.create({
      userId: created.user._id,
      accountId: created.account._id,
      businessId: created.business._id,
      branchId: created.branch._id,
      role: "owner",
    });
  } catch (err) {
    // rollback anything that got created
    if (created.membership) await Membership.deleteOne({ _id: created.membership._id });
    if (created.branch) await Branch.deleteOne({ _id: created.branch._id });
    if (created.business) await Business.deleteOne({ _id: created.business._id });
    if (created.account) await Account.deleteOne({ _id: created.account._id });
    if (created.user) await User.deleteOne({ _id: created.user._id });
    console.error("register error:", err.message);
    return res.status(500).json({ error: "server", message: "Could not create your account. Please try again." });
  }

  return res.status(201).json(sessionPayload(created.user, created.account, created.membership, {
    businesses: [created.business],
    branches: [created.branch],
  }));
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: "Enter your email and password." });

  const user = await User.findOne({ email: parsed.data.email });
  if (!user || !(await checkPassword(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "bad_credentials", message: "Incorrect email or password." });
  }

  const membership = await Membership.findOne({ userId: user._id, role: { $in: ["owner", "admin"] } })
    || await Membership.findOne({ userId: user._id });
  if (!membership) return res.status(403).json({ error: "no_business", message: "This account has no business yet." });

  const account = await Account.findById(membership.accountId);
  const businesses = await Business.find({ accountId: account._id });
  const branches = await Branch.find({ accountId: account._id });

  return res.json(sessionPayload(user, account, membership, { businesses, branches }));
});

const tillSchema = z.object({
  businessCode: z.string().min(4, "Enter your business code"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits"),
});

// POST /api/auth/till — staff login: business code + PIN.
// Rate limiting is a global throttle per business code (not per client),
// so rotating IPs doesn't buy an attacker more attempts.
authRouter.post("/till", async (req, res) => {
  const parsed = tillSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const code = parsed.data.businessCode.trim().toUpperCase();

  if (!rateLimit(`till:${code}`, { max: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: "rate_limited", message: "Too many attempts. Wait a minute and try again." });
  }

  const business = await Business.findOne({ code });
  if (!business) return res.status(401).json({ error: "bad_credentials", message: "Business code or PIN is incorrect." });

  // Small teams: compare the PIN against each active membership that has one.
  const memberships = await Membership.find({
    accountId: business.accountId,
    status: "active",
    pinHash: { $ne: "" },
    $or: [{ businessId: business._id }, { businessId: null }],
  });
  let match = null;
  for (const m of memberships) {
    if (await checkPassword(parsed.data.pin, m.pinHash)) {
      match = m;
      break;
    }
  }
  if (!match) return res.status(401).json({ error: "bad_credentials", message: "Business code or PIN is incorrect." });

  const user = await User.findById(match.userId);
  if (!user || user.status !== "active") {
    return res.status(401).json({ error: "bad_credentials", message: "This staff account is suspended." });
  }

  const account = await Account.findById(business.accountId);
  const branches = match.branchId
    ? await Branch.find({ _id: match.branchId })
    : await Branch.find({ businessId: business._id });

  const body = sessionPayload(user, account, match, { businesses: [business], branches }, false);
  // Till sessions are short-lived by design.
  body.token = signToken(
    { sub: String(user._id), accountId: String(account._id), name: user.name, mode: "till" },
    { expiresIn: "12h" }
  );
  body.mode = "till";
  return res.json(body);
});

// GET /api/auth/me — bootstrap the app after a page refresh
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.auth.userId);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  const membership = await Membership.findOne({ userId: user._id, accountId: req.auth.accountId, role: { $in: ["owner", "admin"] } })
    || await Membership.findOne({ userId: user._id, accountId: req.auth.accountId });
  const account = await Account.findById(req.auth.accountId);
  const businesses = await Business.find({ accountId: req.auth.accountId });
  const branches = await Branch.find({ accountId: req.auth.accountId });
  return res.json(sessionPayload(user, account, membership, { businesses, branches }, false));
});

// Shapes the response the frontend needs. `withToken` false on /me (already has one).
function sessionPayload(user, account, membership, { businesses, branches }, withToken = true) {
  const body = {
    user: { id: user._id, name: user.name, email: user.email },
    account: { id: account._id, name: account.name, plan: account.plan },
    role: membership?.role || "staff",
    permissions: permsForRole(membership?.role || "staff", membership?.permsOverride || []),
    businesses: businesses.map((b) => ({ id: b._id, name: b.name, typeKey: b.typeKey, settings: b.settings })),
    branches: branches.map((br) => ({ id: br._id, businessId: br.businessId, name: br.name })),
  };
  if (withToken) body.token = signToken({ sub: String(user._id), accountId: String(account._id), name: user.name });
  return body;
}
