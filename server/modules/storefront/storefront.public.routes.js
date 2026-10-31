import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Customer } from "#modules/customers/customer.model.js";
import { Account } from "#modules/auth/account.model.js";
import { effectivePlan } from "#shared/plans.js";
import { customerRoom } from "#modules/customers/customerLimit.js";
import { Shopper } from "#modules/storefront/shopper.model.js";
import { Order } from "#modules/storefront/order.model.js";
import { hashPassword, checkPassword } from "#modules/auth/auth.service.js";
import { rateLimit } from "#core/rateLimit.js";
import { sendMail, emailShell, esc } from "#core/mailer.js";
import { config } from "#core/config.js";
import { HttpError } from "#core/httpError.js";
import { publicView } from "#modules/site/site.service.js";
import { resolveStore, requireShopper, signShopperToken } from "#modules/storefront/shopper.auth.js";
import { catalog, priceBasket, shopperConfig, shapeOrder, businessLabel } from "#modules/storefront/store.service.js";
import { placeOrder, cancelByCustomer } from "#modules/storefront/orders.service.js";

/**
 * /api/public/store/:slug — everything a customer does on a business's page.
 *
 * Only registering, signing in and resetting a password are open. Everything
 * else needs a shopper token for THIS store, which is how "register before you
 * can do anything" is enforced: not by hiding buttons, but by the server
 * refusing to show the page's products, prices or orders to a stranger.
 */
export const storefrontPublicRouter = Router({ mergeParams: true });
storefrontPublicRouter.use(resolveStore);

const ip = (req) => req.ip || req.socket?.remoteAddress || "x";
const tooMany = (res) => res.status(429).json({ error: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." });

const digits = (v) => String(v).replace(/\D/g, "");
const phoneField = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ""))
  .refine((v) => /^\+?\d{7,15}$/.test(v), "Enter a valid phone number");
const passwordField = z.string().min(8, "Use at least 8 characters").max(100);

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(120),
  phone: phoneField,
  password: passwordField,
});

const publicShopper = (s) => ({ id: String(s._id), name: s.name, email: s.email, phone: s.phone, address: s.address || "" });

/**
 * The owner's customer book is the source of truth, so registering must not
 * mint a second "John" when the shop already knows John from the till. Match
 * on the phone number's last ten digits (0803… and +234803… are the same
 * person); otherwise start a new customer, marked as having come from the page.
 */
async function customerFor(business, d, plan) {
  const d10 = digits(d.phone).slice(-10);
  const existing =
    d10.length >= 10
      ? await Customer.findOne({ businessId: business._id, phone: { $regex: `${d10}$` } })
      : await Customer.findOne({ businessId: business._id, phone: d.phone });
  if (existing) {
    const set = {};
    if (!existing.email) set.email = d.email;
    if (!existing.whatsapp) set.whatsapp = d.phone;
    if (Object.keys(set).length) await Customer.updateOne({ _id: existing._id }, { $set: set });
    return { customer: existing, created: false };
  }
  // The shop's customer book has a size on its plan. A web sign-up is a new
  // customer, so when it's full the shop must make room (or upgrade) first.
  if ((await customerRoom(business._id, plan)).remaining <= 0) {
    throw new HttpError(409, "store_full", "This shop isn't taking new sign-ups right now. Please contact them directly.");
  }
  const customer = await Customer.create({
    accountId: business.accountId,
    businessId: business._id,
    branchId: null, // an online customer belongs to the whole business, not one store
    name: d.name,
    phone: d.phone,
    whatsapp: d.phone,
    email: d.email,
    source: "website",
  });
  return { customer, created: true };
}

// POST /auth/register
storefrontPublicRouter.post("/auth/register", async (req, res) => {
  if (!rateLimit(`shop-reg:${ip(req)}`, { max: 10, windowMs: 60 * 60_000 })) return tooMany(res);
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  const b = req.business;

  if (await Shopper.exists({ businessId: b._id, email: d.email })) {
    return res.status(409).json({ error: "email_taken", message: "That email already has an account here. Try signing in." });
  }

  let found;
  const account = await Account.findById(b.accountId).select("isSandbox subscription");
  found = await customerFor(b, d, effectivePlan(account));
  const { customer, created } = found;
  try {
    const shopper = await Shopper.create({
      accountId: b.accountId, businessId: b._id, customerId: customer._id,
      name: d.name, email: d.email, phone: d.phone, passwordHash: await hashPassword(d.password), lastLoginAt: new Date(),
    });
    await Customer.updateOne({ _id: customer._id }, { $set: { lastSeen: new Date() } });
    res.status(201).json({ token: signShopperToken(shopper), shopper: publicShopper(shopper) });
  } catch (err) {
    // Lost a race on the same email, or anything else: don't leave an orphan customer behind.
    if (created) await Customer.deleteOne({ _id: customer._id }).catch(() => {});
    if (err?.code === 11000) return res.status(409).json({ error: "email_taken", message: "That email already has an account here. Try signing in." });
    throw err;
  }
});

// POST /auth/login
// A wrong email must cost the same time as a wrong password, or timing reveals who has an account.
let dummyHash;
const dummy = async () => (dummyHash ??= await hashPassword("not-a-real-password"));
storefrontPublicRouter.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!rateLimit(`shop-login:${ip(req)}`, { max: 30, windowMs: 15 * 60_000 }) || !rateLimit(`shop-login:${req.business._id}:${email}`, { max: 8, windowMs: 15 * 60_000 })) return tooMany(res);
  if (!email || !password) return res.status(400).json({ error: "invalid", message: "Enter your email and password." });

  const shopper = await Shopper.findOne({ businessId: req.business._id, email });
  const ok = await checkPassword(password, shopper?.passwordHash || (await dummy())).catch(() => false);
  if (!shopper || !ok) return res.status(401).json({ error: "bad_credentials", message: "That email and password don't match." });
  if (shopper.status !== "active") return res.status(403).json({ error: "blocked", message: "This account has been disabled. Please contact the shop." });

  shopper.lastLoginAt = new Date();
  await shopper.save();
  await Customer.updateOne({ _id: shopper.customerId }, { $set: { lastSeen: new Date() } });
  res.json({ token: signShopperToken(shopper), shopper: publicShopper(shopper) });
});

// POST /auth/forgot — always the same answer, so it can't be used to learn who has an account.
storefrontPublicRouter.post("/auth/forgot", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!rateLimit(`shop-forgot:${ip(req)}`, { max: 6, windowMs: 60 * 60_000 })) return tooMany(res);
  const reply = { ok: true, message: "If that email has an account, we've sent a 6-digit code to it." };
  const shopper = email && (await Shopper.findOne({ businessId: req.business._id, email, status: "active" }));
  if (!shopper) return res.json(reply);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  shopper.resetCodeHash = await hashPassword(code);
  shopper.resetExpiresAt = new Date(Date.now() + 15 * 60_000);
  shopper.resetAttempts = 0;
  await shopper.save();

  const sent = await sendMail({
    to: shopper.email,
    subject: `Your ${businessLabel(req.business)} password code`,
    html: emailShell({
      businessName: businessLabel(req.business),
      heading: "Reset your password",
      intro: "Use this code to choose a new password. It works for 15 minutes.",
      sections: [`<div style="font-size:30px;font-weight:800;letter-spacing:8px;color:#111827;margin:6px 0 4px">${esc(code)}</div>`],
      footNote: "If you didn't ask for this, you can ignore this email.",
    }),
  });
  // With no mail provider configured (local development) show the code so the flow is testable.
  res.json(!config.isProd && !sent.sent ? { ...reply, devCode: code } : reply);
});

// POST /auth/reset
storefrontPublicRouter.post("/auth/reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!rateLimit(`shop-reset:${ip(req)}`, { max: 20, windowMs: 60 * 60_000 })) return tooMany(res);
  const pw = passwordField.safeParse(req.body?.password);
  if (!pw.success) return res.status(400).json({ error: "invalid", message: pw.error.issues[0].message });
  const bad = () => res.status(400).json({ error: "bad_code", message: "That code is wrong or has expired. Ask for a new one." });

  const shopper = await Shopper.findOne({ businessId: req.business._id, email });
  if (!shopper?.resetCodeHash || !shopper.resetExpiresAt || shopper.resetExpiresAt < new Date() || shopper.resetAttempts >= 5) return bad();
  if (!(await checkPassword(String(req.body?.code || ""), shopper.resetCodeHash))) {
    shopper.resetAttempts += 1;
    await shopper.save();
    return bad();
  }
  shopper.passwordHash = await hashPassword(pw.data);
  shopper.resetCodeHash = undefined;
  shopper.resetExpiresAt = undefined;
  shopper.resetAttempts = 0;
  await shopper.save();
  res.json({ token: signShopperToken(shopper), shopper: publicShopper(shopper) });
});

// ── everything below needs a signed-in shopper ──────────────────────────────
storefrontPublicRouter.use(requireShopper);

storefrontPublicRouter.get("/auth/me", (req, res) => res.json({ shopper: publicShopper(req.shopper) }));

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneField.optional(),
  address: z.string().trim().max(250).optional(),
});
storefrontPublicRouter.patch("/auth/me", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;
  const s = req.shopper;
  if (d.name !== undefined) s.name = d.name;
  if (d.phone !== undefined) s.phone = d.phone;
  if (d.address !== undefined) s.address = d.address;
  await s.save();
  // Keep the owner's customer record in step (name / contact / address).
  const set = {};
  if (d.name) set.name = d.name;
  if (d.phone) { set.phone = d.phone; set.whatsapp = d.phone; }
  if (d.address !== undefined) set.address = d.address;
  if (Object.keys(set).length) await Customer.updateOne({ _id: s.customerId }, { $set: set });
  res.json({ shopper: publicShopper(s) });
});

storefrontPublicRouter.post("/auth/password", async (req, res) => {
  const pw = passwordField.safeParse(req.body?.newPassword);
  if (!pw.success) return res.status(400).json({ error: "invalid", message: pw.error.issues[0].message });
  if (!rateLimit(`shop-pw:${req.shopper._id}`, { max: 10, windowMs: 15 * 60_000 })) return tooMany(res);
  if (!(await checkPassword(String(req.body?.currentPassword || ""), req.shopper.passwordHash))) {
    return res.status(400).json({ error: "bad_credentials", message: "Your current password isn't right." });
  }
  req.shopper.passwordHash = await hashPassword(pw.data);
  await req.shopper.save();
  res.json({ ok: true });
});

// GET /site — the full page, now that they're in.
storefrontPublicRouter.get("/site", async (req, res) => {
  res.json({ site: await publicView(req.business), store: shopperConfig(req.business), shopper: publicShopper(req.shopper) });
});

// GET /catalog?q=&category=&page=
storefrontPublicRouter.get("/catalog", async (req, res) => {
  res.json(await catalog(req.business, { q: req.query.q, category: req.query.category, page: req.query.page, limit: req.query.limit }));
});

const itemsSchema = z
  .array(z.object({ productId: z.string().regex(/^[a-f\d]{24}$/i), qty: z.number().int().min(1).max(99) }))
  .min(1, "Your basket is empty")
  .max(40, "That's a lot of different items — please split it into two orders");

// POST /quote — price the basket server-side, without placing anything
storefrontPublicRouter.post("/quote", async (req, res) => {
  const parsed = z.object({ items: itemsSchema, fulfilmentType: z.enum(["pickup", "delivery"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const p = await priceBasket(req.business, parsed.data.items, parsed.data.fulfilmentType);
  res.json({
    lines: (p.lines || []).map((l) => ({ productId: String(l.productId), name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineNet: l.lineNet, imageUrl: l.imageUrl })),
    subtotal: p.subtotal || 0, vat: p.vat || 0, deliveryFee: p.deliveryFee || 0, total: p.total || 0, problems: p.problems,
  });
});

const orderSchema = z.object({
  clientOrderId: z.string().min(8).max(64),
  items: itemsSchema,
  fulfilment: z.object({ type: z.enum(["pickup", "delivery"]), address: z.string().trim().max(250).optional() }),
  payment: z.object({ method: z.enum(["cash_on_delivery", "pay_at_pickup", "transfer"]) }),
  contactPhone: phoneField.optional(),
  note: z.string().trim().max(300).optional(),
  expectedTotal: z.number().min(0).optional(),
});

// POST /orders
storefrontPublicRouter.post("/orders", async (req, res) => {
  if (!rateLimit(`shop-order:${req.shopper._id}`, { max: 12, windowMs: 60 * 60_000 })) return tooMany(res);
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const out = await placeOrder(req.business, req.shopper, parsed.data);
  if (out.problems) return res.status(409).json({ error: "basket_problem", message: out.problems[0].message, problems: out.problems });
  if (out.priceChanged) return res.status(409).json({ error: "price_changed", message: "Some prices changed while you were shopping. Please check your total.", total: out.priced.total, deliveryFee: out.priced.deliveryFee, vat: out.priced.vat, subtotal: out.priced.subtotal });
  const store = shopperConfig(req.business);
  res.status(out.replay ? 200 : 201).json({ order: shapeOrder(out.order, { bank: store.bank }) });
});

// GET /orders — only this shopper's own
storefrontPublicRouter.get("/orders", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = { shopperId: req.shopper._id };
  const [rows, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  const store = shopperConfig(req.business);
  res.json({ orders: rows.map((o) => shapeOrder(o, { bank: store.bank })), page, pages: Math.max(1, Math.ceil(total / limit)), total });
});

storefrontPublicRouter.get("/orders/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "not_found", message: "Order not found." });
  const o = await Order.findOne({ _id: req.params.id, shopperId: req.shopper._id });
  if (!o) return res.status(404).json({ error: "not_found", message: "Order not found." });
  res.json({ order: shapeOrder(o, { bank: shopperConfig(req.business).bank }) });
});

storefrontPublicRouter.post("/orders/:id/cancel", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "not_found", message: "Order not found." });
  const o = await cancelByCustomer(req.business, req.shopper, req.params.id);
  res.json({ order: shapeOrder(o) });
});

