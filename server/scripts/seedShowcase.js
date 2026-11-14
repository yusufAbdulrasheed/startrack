import mongoose from "mongoose";
import { SHOWCASE_OWNER_PASSWORD, SHOWCASE_PLAN_KEYS, showcaseEmail, showcaseSubscription } from "./showcasePlans.js";
import { PLANS } from "#shared/plans.js";
import { connectDb } from "#core/db.js";
import { hashPassword } from "#modules/auth/auth.service.js";
import { User } from "#modules/auth/user.model.js";
import { Account } from "#modules/auth/account.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { Counter, nextSeq } from "#core/counters.js";
import { money } from "#core/money.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { typeTemplate } from "#shared/businessTypes.js";
import { DEMOS } from "#modules/auth/demoShops.js";
import { demoFor } from "#platform/registry.js";
import { purgeAccountData } from "#modules/auth/purgeTenant.js";
import { VerificationCode } from "#modules/auth/verificationCode.model.js";

/**
 * Seeds permanent, demonstrable businesses: every trade on every plan (Freemium, Pro, Business) — one independent owner
 * account per vertical, each on its own Account with its own Membership, the
 * way separate real tenants would be. Logging in as one owner shows only
 * their business, never the other six. Unlike server/modules/auth/demoSeed.js
 * (the 24h "Try the demo" sandbox, still untouched and still random-password),
 * everything here uses fixed, known credentials and never expires.
 *
 * Run: `node server/scripts/seedShowcase.js` (add --reset to wipe and rebuild;
 * add --only=<type> to act on a single business, e.g. `--reset --only=academy`).
 */

const OWNER_PASSWORD = SHOWCASE_OWNER_PASSWORD;

const ownerEmailFor = showcaseEmail;

const CUSTOMERS = [
  { name: "Mama Nkechi", phone: "08031112233" },
  { name: "Alhaji Musa", phone: "08154445566" },
  { name: "Blessing Okoro", phone: "07067778899" },
  { name: "Emeka Nwafor", phone: "08098761234" },
  { name: "Fatima Bello", phone: "07033214455" },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);

// ── Owner + account (one independent tenant per business) ──────────────

async function getOrCreateOwner(typeKey, plan, shop) {
  const email = ownerEmailFor(typeKey, plan);
  let user = await User.findOne({ email });
  if (user) {
    const account = await Account.findOne({ ownerUserId: user._id });
    return { user, account };
  }
  user = await User.create({ name: `${shop.business} Owner`, email, passwordHash: await hashPassword(OWNER_PASSWORD), emailVerified: true, phoneVerified: true });
  const account = await Account.create({ name: `${shop.business} (${PLANS[plan].name})`, ownerUserId: user._id, isSandbox: false, plan, subscription: showcaseSubscription(plan) });
  return { user, account };
}

/**
 * Wipes every document this script could have written for a set of accounts,
 * including the owners themselves — a full purge, not a per-run reset.
 */
async function purgeAccounts(accountIds) {
  if (!accountIds.length) return 0;
  const businesses = await Business.find({ accountId: { $in: accountIds } }).select("_id");
  const branches = await Branch.find({ accountId: { $in: accountIds } }).select("_id");
  const branchIds = branches.map((b) => b._id);
  const memberships = await Membership.find({ accountId: { $in: accountIds } }).select("userId");
  const userIds = memberships.map((m) => m.userId);

  await purgeAccountData(accountIds);
  await Promise.all([
    User.deleteMany({ _id: { $in: userIds } }),
    VerificationCode.deleteMany({ userId: { $in: userIds } }),
    Counter.deleteMany({ scopeKey: { $regex: `:(${branchIds.map(String).join("|")})$` } }),
  ]);
  await Account.deleteMany({ _id: { $in: accountIds } });
  return businesses.length;
}

/**
 * Finds every account this script has ever created — under the current
 * per-business-owner emails AND the older shared owner@startrack.demo model
 * — and purges all of them. Run once, before reseeding, so a leftover run
 * under the old model can never collide (e.g. two "amaka.blinds@..." staff
 * users fighting over the same email) with a fresh one under the new model.
 */
async function wipeAllShowcaseData() {
  const legacyUsers = await User.find({ email: { $regex: /@startrack\.demo$/i } }).select("_id");
  const userIds = legacyUsers.map((u) => u._id);
  if (!userIds.length) return;
  // Only accounts OWNED by a seeded user are purged: a real account that happened to
  // list a seeded email as a member can never be swept up with them.
  const accountIds = (await Account.find({ ownerUserId: { $in: userIds } }).select("_id")).map((a) => a._id);
  if (!accountIds.length) return;
  const wiped = await purgeAccounts(accountIds);
  console.log(`Wiped ${accountIds.length} previous showcase account(s), ${wiped} business(es) — starting clean.\n`);
}

// ── Catalog + opening stock ──────────────────────────────────────────

async function seedCatalog(ctx, shop) {
  const byName = new Map();
  for (const item of shop.catalog) {
    // A service (haircut, course fee, website build) is sold, never counted: no stock, no opening movement.
    if (item.service) {
      const svc = await Product.create({
        accountId: ctx.accountId, businessId: ctx.businessId,
        name: item.name, category: item.category, price: item.price, cost: 0, reorderLevel: 0,
        archetype: "service", durationMin: item.duration || 0, imageUrl: item.image || "",
      });
      byName.set(item.name, { doc: svc, ...item, cost: 0 });
      continue;
    }
    const p = await Product.create({
      accountId: ctx.accountId, businessId: ctx.businessId,
      name: item.name, category: item.category, barcode: item.barcode || "",
      price: item.price, cost: item.cost, reorderLevel: item.reorder,
      imageUrl: item.image || "",
      ...(item.expiry ? { expiry: item.expiry } : {}),
    });
    await Inventory.create({ accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: p._id, stock: item.stock });
    await StockMovement.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: p._id, productName: p.name,
      type: "IN", qty: item.stock, balanceAfter: item.stock, refType: "manual", reason: "Opening stock",
      actorId: ctx.userId, actorName: ctx.actorName, at: daysAgo(30),
    });
    byName.set(item.name, { doc: p, ...item });
  }

  if (shop.madeToOrder) {
    const bom = shop.madeToOrder.bom
      .map((b) => ({ productId: byName.get(b.component)?.doc._id, per: b.per, factor: b.factor }))
      .filter((b) => b.productId);
    if (bom.length) {
      const p = await Product.create({
        accountId: ctx.accountId, businessId: ctx.businessId, name: shop.madeToOrder.name,
        category: shop.madeToOrder.category, archetype: "made_to_order",
        price: shop.madeToOrder.price, cost: 0, reorderLevel: 0,
        imageUrl: shop.madeToOrder.image || "", bom,
      });
      byName.set(shop.madeToOrder.name, { doc: p, name: shop.madeToOrder.name, price: shop.madeToOrder.price });
    }
  }
  return byName;
}

// ── Two-and-a-half weeks of trading history ─────────────────────────

async function seedTradingHistory(ctx, byName, customers, sellers) {
  const products = [...byName.values()];
  let lastSale = null;
  for (let dayOffset = 17; dayOffset >= 0; dayOffset--) {
    const salesToday = dayOffset === 0 ? randInt(3, 6) : randInt(3, 8);
    for (let s = 0; s < salesToday; s++) {
      const at = new Date();
      at.setDate(at.getDate() - dayOffset);
      at.setHours(randInt(8, 19), randInt(0, 59), 0, 0);
      if (at > new Date()) at.setHours(new Date().getHours() - 1);

      const lineCount = randInt(1, 3);
      const chosen = new Map();
      for (let i = 0; i < lineCount; i++) {
        const prod = pick(products);
        if (prod.doc.archetype === "made_to_order") continue; // keep the seed simple — a plain stock cart
        chosen.set(String(prod.doc._id), { prod, qty: (chosen.get(String(prod.doc._id))?.qty || 0) + randInt(1, 3) });
      }
      if (!chosen.size) continue;
      const items = [...chosen.values()].map(({ prod, qty }) => ({
        productId: prod.doc._id, name: prod.name, qty,
        unitPrice: prod.price, lineCost: money(prod.cost * qty), lineNet: money(prod.price * qty), returnedQty: 0,
        ...(prod.service ? { service: true } : {}),
      }));
      const subtotal = money(items.reduce((sum, i) => sum + i.lineNet, 0));
      const discount = Math.random() < 0.2 ? money(Math.min(300, subtotal * 0.05)) : 0;
      const vat = money((subtotal - discount) * 0.075);
      const total = money(subtotal - discount + vat);
      const method = pick(["cash", "cash", "pos", "transfer"]);
      const seller = pick(sellers);
      const customer = Math.random() < 0.45 ? pick(customers) : null;

      for (const line of items) {
        if (line.service) continue; // nothing to count
        const inv = await Inventory.findOneAndUpdate(
          { branchId: ctx.branchId, productId: line.productId }, { $inc: { stock: -line.qty } }, { new: true }
        );
        if (!inv || inv.stock < 0) { await Inventory.updateOne({ branchId: ctx.branchId, productId: line.productId }, { $set: { stock: 0 } }); continue; }
        await StockMovement.create({
          accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: line.productId, productName: line.name,
          type: "OUT", qty: -line.qty, balanceAfter: inv.stock, refType: "sale", reason: "Sale",
          actorId: seller._id, actorName: seller.name, at,
        });
      }
      const seq = await nextSeq(`sale:${ctx.branchId}`);
      lastSale = await Sale.create({
        accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
        saleNo: `R-${String(seq).padStart(5, "0")}`, at,
        staffId: seller._id, staffName: seller.name,
        customerId: customer?._id, customerName: customer?.name || "",
        items, subtotal, discount, vat, total, payments: [{ method, amount: total }],
      });
      if (customer) {
        await Customer.updateOne({ _id: customer._id }, {
          $inc: { totalSpend: total, visits: 1 }, $set: { lastSeen: at, lastBranchId: ctx.branchId },
        });
      }
      const totalCost = money(items.reduce((sum, i) => sum + i.lineCost, 0));
      await DailyMetric.findOneAndUpdate(
        { businessId: ctx.businessId, branchId: ctx.branchId, date: localDay(at) },
        { $inc: { revenue: total, cost: totalCost, profit: money(total - vat - totalCost), txns: 1, discountTotal: discount, vatTotal: vat, [`paymentSplit.${method}`]: total }, $setOnInsert: { accountId: ctx.accountId } },
        { upsert: true }
      );
    }
  }
  return lastSale;
}

// ── Vertical-specific showcase data ──────────────────────────────────

// ── Orchestration ────────────────────────────────────────────────────

async function seedBusiness(typeKey, plan, owner, account) {
  const shop = DEMOS[typeKey];
  const template = typeTemplate(typeKey);

  const business = await Business.create({
    accountId: account._id, name: `${shop.business} (${PLANS[plan].name})`, typeKey,
    settings: { currency: "₦", vatEnabled: true, vatRate: 7.5, modules: template.modules },
  });
  const branch = await Branch.create({ accountId: account._id, businessId: business._id, name: shop.branch.name, address: shop.branch.address });
  await Membership.create({ userId: owner._id, accountId: account._id, businessId: business._id, branchId: branch._id, role: "owner" });

  // No staff are seeded: the owner adds their own once signed in.

  const ctx = { accountId: account._id, businessId: business._id, branchId: branch._id, userId: owner._id, actorName: "Demo Owner", business };

  const byName = await seedCatalog(ctx, shop);

  const customers = [];
  for (const c of CUSTOMERS) customers.push(await Customer.create({ accountId: account._id, businessId: business._id, name: c.name, phone: c.phone, whatsapp: c.phone }));

  // The signature vertical logic each business exists to show off — seeded
  // BEFORE the random trading history below, which sells down whatever
  // stock is left over. Running it after would race the cohort's feed, the
  // production run's raw materials, and the serial count against however
  // much of that same stock the random simulation happened to sell first.
  await demoFor(typeKey)?.seed?.({
    ctx, base: { accountId: account._id, businessId: business._id }, branch, business, byName, customers, shop,
  });

  await seedTradingHistory(ctx, byName, customers, [owner]);

  // Two days of expenses + today's clock-in, same shape as the sandbox demo.
  for (const [type, amount, offset] of [["Fuel", 3800, 2], ["Transport", 1500, 1], ["Diesel", 12000, 0]]) {
    const at = daysAgo(offset);
    await Expense.create({ accountId: account._id, businessId: business._id, branchId: branch._id, type, amount, actorId: owner._id, actorName: "Demo Owner", at });
    await DailyMetric.findOneAndUpdate(
      { businessId: business._id, branchId: branch._id, date: localDay(at) },
      { $inc: { expenses: amount }, $setOnInsert: { accountId: account._id } }, { upsert: true }
    );
  }

  // Every sandbox's "raise alerts now" step, so the bell isn't empty on login.
  try {
    const { scanStock, scanExpiry } = await import("#modules/alerts/alerts.service.js");
    await scanStock(business);
    await scanExpiry(business);
  } catch (err) {
    console.error(`  alert seeding failed for ${typeKey}:`, err.message);
  }

  return { business, branch };
}

async function main() {
  const reset = process.argv.includes("--reset");
  // --only=<type> limits the run (and a --reset) to ONE business, so repairing
  // or rebuilding one showcase never touches the others — important when
  // MONGODB_URI points at a shared cloud database.
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  if (only && !DEMOS[only]) {
    console.error(`Unknown business type "${only}". Choose one of: ${Object.keys(DEMOS).join(", ")}`);
    process.exit(1);
  }
  await connectDb();

  if (reset && only) {
    console.log(`Resetting the ${only} showcases only…`);
    for (const plan of SHOWCASE_PLAN_KEYS) {
      const owner = await User.findOne({ email: ownerEmailFor(only, plan) });
      if (!owner) continue;
      const accounts = await Account.find({ ownerUserId: owner._id }).select("_id");
      await purgeAccounts(accounts.map((a) => a._id));
      await User.deleteOne({ _id: owner._id }); // the owner may have no membership to be swept up by the purge
    }
  } else if (reset) {
    console.log("Resetting previous showcase data…");
    await wipeAllShowcaseData();
  }

  const results = [];
  for (const typeKey of Object.keys(DEMOS)) {
    if (only && typeKey !== only) continue;
    const shop = DEMOS[typeKey];
    for (const plan of SHOWCASE_PLAN_KEYS) {
      let { user: owner, account } = await getOrCreateOwner(typeKey, plan, shop);

      let existingBusiness = await Business.findOne({ accountId: account._id, typeKey });
      // A run that was cut off (network, Ctrl-C) can leave a half-built business. Seeding always
      // ends by writing the expenses, so a business without any is unfinished: rebuild it.
      if (existingBusiness && !(await Expense.exists({ accountId: account._id }))) {
        console.log(`Rebuilding ${typeKey} / ${plan} — an earlier run didn't finish it.`);
        await purgeAccounts([account._id]);
        await User.deleteOne({ _id: owner._id });
        ({ user: owner, account } = await getOrCreateOwner(typeKey, plan, shop));
        existingBusiness = null;
      }
      if (existingBusiness) {
        console.log(`Skipping ${typeKey} / ${plan} — already seeded (business ${existingBusiness._id}). Run with --reset to rebuild.`);
        results.push({ typeKey, plan, business: existingBusiness, ownerEmail: owner.email });
        continue;
      }

      console.log(`Seeding ${typeKey} / ${PLANS[plan].name}…`);
      const { business } = await seedBusiness(typeKey, plan, owner, account);
      results.push({ typeKey, plan, business, ownerEmail: owner.email });
    }
  }

  console.log("\n" + "=".repeat(72));
  console.log(`StarTrack showcase — ${results.length} owner logins (every trade on every plan), all with password ${OWNER_PASSWORD}`);
  console.log("=".repeat(72));
  for (const plan of SHOWCASE_PLAN_KEYS) {
    console.log(`\n${PLANS[plan].name.toUpperCase()}`);
    for (const r of results.filter((x) => x.plan === plan)) {
      console.log(`  ${DEMOS[r.typeKey].label.padEnd(26)} ${r.ownerEmail.padEnd(36)} business code ${r.business.code}`);
    }
  }
  console.log("=".repeat(72));

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
