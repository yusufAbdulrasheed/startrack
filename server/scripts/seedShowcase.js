import mongoose from "mongoose";
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
import { Return } from "#modules/returns/return.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { CustomerLedgerEntry, applyCreditChange } from "#modules/customers/customerLedger.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { Attendance } from "#modules/staff/attendance.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { AuditLog } from "#modules/audit/auditLog.model.js";
import { Counter, nextSeq } from "#core/counters.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { money } from "#core/money.js";
import { localDay, bumpDailyMetric } from "#modules/metrics/metrics.service.js";
import { typeTemplate } from "#shared/businessTypes.js";
import { DEMOS } from "#modules/auth/demoShops.js";
import { priceLines, totalsFor } from "#modules/jobs/jobs.service.js";
import { Job } from "#modules/jobs/job.model.js";
import { ProductionRun } from "#modules/production/productionRun.model.js";
import { Serial } from "#modules/businesses/electronics/serial.model.js";
import { Cohort } from "#modules/businesses/poultry/cohort.model.js";
import { RoomType, Room } from "#modules/businesses/hotel/room.model.js";
import { Stay } from "#modules/businesses/hotel/stay.model.js";
import { ColdRoomBatch } from "#modules/businesses/coldroom/batch.model.js";
import { ColdRoomBreakdown } from "#modules/businesses/coldroom/breakdown.model.js";
import { syncCartonEquivalentStock } from "#modules/businesses/coldroom/coldroom.service.js";
import { LoyaltyCard } from "#modules/loyalty/loyaltyCard.model.js";
import { issueCardForCustomer } from "#modules/loyalty/loyaltyCard.service.js";
import { Ticket } from "#modules/support/ticket.model.js";
import { RestockSuggestion } from "#modules/ai/restockSuggestion.model.js";
import { VerificationCode } from "#modules/auth/verificationCode.model.js";
import { GymPlan } from "#modules/businesses/gym/gymPlan.model.js";
import { GymSubscription } from "#modules/businesses/gym/gymSubscription.model.js";
import { GymCheckIn } from "#modules/businesses/gym/gymCheckIn.model.js";

/**
 * Seeds seven permanent, demonstrable businesses — one independent owner
 * account per vertical, each on its own Account with its own Membership, the
 * way separate real tenants would be. Logging in as one owner shows only
 * their business, never the other six. Unlike server/modules/auth/demoSeed.js
 * (the 24h "Try the demo" sandbox, still untouched and still random-password),
 * everything here uses fixed, known credentials and never expires.
 *
 * Run: `node server/scripts/seedShowcase.js` (add --reset to wipe and rebuild).
 */

const OWNER_PASSWORD = "Demo@1234";
const STAFF_PIN_STAFF = "1111";
const STAFF_PIN_MANAGER = "2222";

const ownerEmailFor = (typeKey) => `${typeKey}.owner@startrack.demo`;

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

async function getOrCreateOwner(typeKey, shop) {
  const email = ownerEmailFor(typeKey);
  let user = await User.findOne({ email });
  if (user) {
    const account = await Account.findOne({ ownerUserId: user._id });
    return { user, account };
  }
  user = await User.create({ name: `${shop.business} Owner`, email, passwordHash: await hashPassword(OWNER_PASSWORD) });
  const account = await Account.create({ name: shop.business, ownerUserId: user._id, isSandbox: false });
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

  const byAccount = { accountId: { $in: accountIds } };
  await Promise.all([
    Product.deleteMany(byAccount), Inventory.deleteMany(byAccount), StockMovement.deleteMany(byAccount),
    Sale.deleteMany(byAccount), Return.deleteMany(byAccount), Customer.deleteMany(byAccount),
    CustomerLedgerEntry.deleteMany(byAccount),
    Expense.deleteMany(byAccount), Attendance.deleteMany(byAccount), DailyMetric.deleteMany(byAccount),
    AuditLog.deleteMany(byAccount),
    Job.deleteMany(byAccount), ProductionRun.deleteMany(byAccount), Serial.deleteMany(byAccount),
    Cohort.deleteMany(byAccount), RoomType.deleteMany(byAccount), Room.deleteMany(byAccount), Stay.deleteMany(byAccount),
    ColdRoomBatch.deleteMany(byAccount), ColdRoomBreakdown.deleteMany(byAccount),
    LoyaltyCard.deleteMany(byAccount), Ticket.deleteMany(byAccount), RestockSuggestion.deleteMany(byAccount),
    GymPlan.deleteMany(byAccount), GymSubscription.deleteMany(byAccount), GymCheckIn.deleteMany(byAccount),
    Membership.deleteMany({ accountId: { $in: accountIds } }),
    Branch.deleteMany({ accountId: { $in: accountIds } }),
    Business.deleteMany({ accountId: { $in: accountIds } }),
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
  const ownedAccountIds = (await Account.find({ ownerUserId: { $in: userIds } }).select("_id")).map((a) => a._id);
  const memberAccountIds = await Membership.find({ userId: { $in: userIds } }).distinct("accountId");
  const accountIds = [...new Map([...ownedAccountIds, ...memberAccountIds].map((id) => [String(id), id])).values()];
  if (!accountIds.length) return;
  const wiped = await purgeAccounts(accountIds);
  console.log(`Wiped ${accountIds.length} previous showcase account(s), ${wiped} business(es) — starting clean.\n`);
}

// ── One staff member, with a till PIN ───────────────────────────────

async function makeStaff({ account, business, branch, name, role, pin, tag }) {
  const email = `${name.split(" ")[0].toLowerCase()}.${tag}@startrack.demo`;
  const user = await User.create({ name, email, passwordHash: await hashPassword(`unused-${Math.random().toString(36).slice(2)}`) });
  await Membership.create({
    userId: user._id, accountId: account._id, businessId: business._id, branchId: branch._id,
    role, pinHash: await hashPassword(pin), status: "active",
  });
  return user;
}

// ── Catalog + opening stock ──────────────────────────────────────────

async function seedCatalog(ctx, shop) {
  const byName = new Map();
  for (const item of shop.catalog) {
    const p = await Product.create({
      accountId: ctx.accountId, businessId: ctx.businessId,
      name: item.name, category: item.category, barcode: item.barcode || "",
      price: item.price, cost: item.cost, reorderLevel: item.reorder,
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
        price: shop.madeToOrder.price, cost: 0, reorderLevel: 0, bom,
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
      }));
      const subtotal = money(items.reduce((sum, i) => sum + i.lineNet, 0));
      const discount = Math.random() < 0.2 ? money(Math.min(300, subtotal * 0.05)) : 0;
      const vat = money((subtotal - discount) * 0.075);
      const total = money(subtotal - discount + vat);
      const method = pick(["cash", "cash", "pos", "transfer"]);
      const seller = pick(sellers);
      const customer = Math.random() < 0.45 ? pick(customers) : null;

      for (const line of items) {
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

async function seedHotel(ctx, shop, byName) {
  const typeByName = new Map();
  for (const t of shop.rooms.types) {
    typeByName.set(t.name, await RoomType.create({ accountId: ctx.accountId, businessId: ctx.businessId, name: t.name, rate: t.rate, capacity: t.capacity, amenities: t.amenities }));
  }
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const roomByNumber = new Map();
  for (const r of shop.rooms.list) {
    const type = typeByName.get(r.type);
    roomByNumber.set(r.number, {
      doc: await Room.create({ accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, roomTypeId: type._id, number: r.number, floor: r.floor || "", housekeeping: r.housekeeping || "clean", note: r.note || "" }),
      type,
    });
  }
  for (const s of shop.rooms.stays) {
    const room = roomByNumber.get(s.room);
    if (!room) continue;
    const checkIn = day(s.from), checkOut = day(s.to);
    const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000);
    const rate = room.type.rate;
    const charges = [];
    for (let i = 0; i < nights; i++) {
      charges.push({ at: new Date(), source: "room", name: `${room.doc.number} · ${room.type.name} · ${day(s.from + i)}`, qty: 1, unitPrice: rate, lineCost: 0, lineNet: rate, byName: "Demo Owner" });
    }
    for (const extra of s.extras || []) {
      const p = byName.get(extra);
      if (!p) continue;
      charges.push({ at: new Date(), source: /Laundry/.test(extra) ? "laundry" : /Beer|Drink|Wine|Juice/.test(extra) ? "bar" : "kitchen", productId: p.doc._id, name: p.name, qty: 1, unitPrice: p.price, lineCost: p.cost, lineNet: p.price, byName: "Amaka Obi", stockMoved: false });
    }
    const seq = await nextSeq(`folio:${ctx.branchId}`);
    await Stay.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, folioNo: `F-${String(seq).padStart(5, "0")}`,
      roomId: room.doc._id, roomNumber: room.doc.number, roomTypeName: room.type.name, guestName: s.guest, guestPhone: s.phone || "",
      guests: 1, checkIn, checkOut, nights, nightlyRate: rate, status: s.status,
      checkedInAt: s.status === "checked_in" || s.status === "checked_out" ? new Date(`${checkIn}T14:00:00`) : undefined,
      checkedOutAt: s.status === "checked_out" ? new Date(`${checkOut}T11:00:00`) : undefined,
      charges, payments: [], staffName: "Demo Owner",
    });
  }
}

async function seedPoultry(ctx, byName) {
  const cohort = await Cohort.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
    name: "Batch 7 — Broilers", species: "Broiler", startDate: daysAgo(28), initialCount: 150, currentCount: 150,
  });
  const feed = byName.get("Broiler Starter (25kg bag)")?.doc;
  const bird = byName.get("Live Broiler (bird)")?.doc;
  if (feed) {
    // Deliberately modest — the catalog seeds this bag already low (14, vs a
    // reorder level of 20) to show a real low-stock alert; feeding more than
    // that would either crash the seed or empty the shelf outright.
    for (const [daysBack, qty] of [[21, 3], [14, 4], [7, 3]]) {
      await applyMovement(ctx, { branchId: ctx.branchId, productId: feed._id, productName: feed.name, type: "OUT", qty: -qty, refType: "cohort_feed", refId: cohort._id, reason: `Fed to ${cohort.name}` });
      cohort.events.push({ type: "note", note: `${qty} bags fed`, at: daysAgo(daysBack) });
    }
  }
  cohort.currentCount -= 5;
  cohort.mortalityCount = 5;
  cohort.events.push({ type: "mortality", count: 5, note: "Heat stress, week 2", at: daysAgo(18) });
  if (bird) {
    await applyMovement(ctx, { branchId: ctx.branchId, productId: bird._id, productName: bird.name, type: "IN", qty: 100, refType: "cohort_harvest", refId: cohort._id, reason: `Harvested from ${cohort.name}` });
    cohort.currentCount -= 100;
    cohort.events.push({ type: "harvest", count: 100, productName: bird.name, note: "First harvest round", at: daysAgo(3) });
  }
  await cohort.save();
}

async function seedWaterProduction(ctx, byName) {
  const pack = byName.get("Bottled Water 50cl (pack of 12)")?.doc;
  const preform = byName.get("Preform 50cl (piece)")?.doc;
  const cap = byName.get("Bottle Cap (piece)")?.doc;
  const label = byName.get("Shrink Label (piece)")?.doc;
  if (!pack || !preform || !cap || !label) return;

  pack.bom = [
    { productId: preform._id, per: "unit", factor: 12, includeLeakage: true },
    { productId: cap._id, per: "unit", factor: 12, includeLeakage: true },
    { productId: label._id, per: "unit", factor: 12, includeLeakage: true },
  ];
  pack.producedUnitsPerStockUnit = 12;
  await pack.save();

  const producedUnits = 120, leakage = 3, yieldPer = 12;
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const components = pack.bom.map((line) => {
    const comp = [preform, cap, label].find((c) => String(c._id) === String(line.productId));
    return { productId: comp._id, name: comp.name, qty: round3(line.factor * (producedUnits + leakage)), includedLeakage: true };
  });
  const creditedQty = Math.floor(producedUnits / yieldPer);
  const runId = new mongoose.Types.ObjectId();
  for (const c of components) {
    await applyMovement(ctx, { branchId: ctx.branchId, productId: c.productId, productName: c.name, type: "OUT", qty: -c.qty, refType: "production", refId: runId, reason: `Used for production run of ${pack.name}` });
  }
  await applyMovement(ctx, { branchId: ctx.branchId, productId: pack._id, productName: pack.name, type: "IN", qty: creditedQty, refType: "production", refId: runId, reason: `Production run — ${producedUnits} unit(s), ${leakage} leakage` });
  const seq = await nextSeq(`run:${ctx.branchId}`);
  await ProductionRun.create({
    _id: runId, accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, runNo: `PR-${String(seq).padStart(5, "0")}`,
    productId: pack._id, productName: pack.name, producedUnits, leakage, creditedQty, producedUnitsPerStockUnit: yieldPer,
    components, note: "Morning bottling run", staffName: ctx.actorName, at: daysAgo(2),
  });
}

async function seedColdroom(ctx, business, byName) {
  const titus = byName.get("Titus Mackerel")?.doc;
  const panla = byName.get("Panla (Hake)")?.doc;
  if (!titus || !panla) return;

  // An open batch, mostly still sealed — the normal state.
  const b1 = await ColdRoomBatch.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: titus._id, productName: titus.name,
    purchaseDate: daysAgo(6), cartonsReceived: 30, packSizeKg: 20, unitCostPerCarton: 15600,
    remainingCartons: 22, remainingKg: 0, remainingPieces: 0,
  });
  // A second, older Titus batch, partly broken down — shows FIFO in action.
  const b2 = await ColdRoomBatch.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: titus._id, productName: titus.name,
    purchaseDate: daysAgo(12), cartonsReceived: 15, packSizeKg: 20, unitCostPerCarton: 14800,
    remainingCartons: 4, remainingKg: 0, remainingPieces: 0,
  });
  // Panla batch, already broken down into loose kg AND counted pieces from
  // two separate cartons — the multi-unit pool in one screenshot.
  const b3 = await ColdRoomBatch.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: panla._id, productName: panla.name,
    purchaseDate: daysAgo(4), cartonsReceived: 20, packSizeKg: 10, unitCostPerCarton: 6500,
    remainingCartons: 15, remainingKg: 9.2, remainingPieces: 34, avgPieceWeightKg: 0.27,
  });

  // Log the breakdown that produced b2's loose stock — the shrinkage the
  // whole module exists to make visible.
  const cartonsOpened = 11, expectedYieldKg = money(cartonsOpened * b2.packSizeKg), actualWeighedKg = 214.4;
  const varianceKg = money(expectedYieldKg - actualWeighedKg);
  await ColdRoomBreakdown.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, batchId: b2._id, productId: titus._id, productName: titus.name,
    cartonsOpened, expectedYieldKg, actualWeighedKg, varianceKg, variancePercent: money((varianceKg / expectedYieldKg) * 100),
    byName: ctx.actorName, note: "Morning breakdown", at: daysAgo(5),
  });
  // b2 was purposely seeded already-net-of-that-breakdown (remainingCartons
  // 4 = 15 − 11), so the batch and the breakdown record agree with each
  // other exactly the way a real one would after the write.
  const b2LooseKg = money(214.4 - 10 * 20); // whatever wasn't sold since — a small, believable remainder
  b2.remainingKg = b2LooseKg > 0 ? b2LooseKg : 6.4;
  await b2.save();

  const secondBreakdownExpected = money(2 * b3.packSizeKg + 2 * b3.packSizeKg);
  await ColdRoomBreakdown.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, batchId: b3._id, productId: panla._id, productName: panla.name,
    cartonsOpened: 2, expectedYieldKg: money(2 * b3.packSizeKg), actualWeighedKg: 19.2,
    varianceKg: money(2 * b3.packSizeKg - 19.2), variancePercent: money(((2 * b3.packSizeKg - 19.2) / (2 * b3.packSizeKg)) * 100),
    byName: ctx.actorName, note: "Weighed loose for the counter", at: daysAgo(3),
  });
  await ColdRoomBreakdown.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, batchId: b3._id, productId: panla._id, productName: panla.name,
    cartonsOpened: 3, expectedYieldKg: money(3 * b3.packSizeKg), actualWeighedKg: 34 * 0.27,
    resultingPieceCount: 34, varianceKg: money(3 * b3.packSizeKg - 34 * 0.27), variancePercent: money(((3 * b3.packSizeKg - 34 * 0.27) / (3 * b3.packSizeKg)) * 100),
    byName: ctx.actorName, note: "Cut into pieces for retail", at: daysAgo(2),
  });

  // Reconcile the generic ledger to whatever the batches actually say now —
  // exactly what every real batch-mutating route calls.
  for (const product of [titus, panla]) {
    await syncCartonEquivalentStock(ctx, ctx.branchId, product, { refType: "coldroom_purchase", reason: "Showcase seed reconciliation" });
  }

  // A cold-chain-loss event on the older Titus batch's last cartons — the
  // high-severity event the whole trade is built to fear.
  const lossCartons = 1;
  await ColdRoomBatch.updateOne({ _id: b2._id }, { $inc: { remainingCartons: -lossCartons } });
  const updatedB2 = await ColdRoomBatch.findById(b2._id);
  await syncCartonEquivalentStock(ctx, ctx.branchId, titus, { refType: "coldroom_cold_chain_loss", reason: "Generator down for 3 hours overnight", wasteReasonIfLoss: "cold_chain_failure" });
  await DailyMetric.findOneAndUpdate(
    { businessId: ctx.businessId, branchId: ctx.branchId, date: localDay(daysAgo(1)) },
    { $inc: { profit: -money(lossCartons * updatedB2.unitCostPerCarton), wasteTotal: money(lossCartons * updatedB2.unitCostPerCarton) }, $setOnInsert: { accountId: ctx.accountId } },
    { upsert: true }
  );
}

/**
 * Three members in different states, so Members/Check-In have something
 * real the moment the showcase opens — unlike the 24h "Try the demo"
 * sandbox, which deliberately leaves this to the visitor (see demoShops.js's
 * gym `pending` note): a permanent showcase should look permanently lived-in.
 */
async function seedGym(ctx, shop, customers) {
  const plans = [];
  for (const p of shop.gymPlans) {
    plans.push(await GymPlan.create({ accountId: ctx.accountId, businessId: ctx.businessId, name: p.name, price: p.price, durationDays: p.durationDays }));
  }
  const planByName = new Map(plans.map((p) => [p.name, p]));
  const monthly = planByName.get("Monthly") || plans[0];
  const annual = planByName.get("Annual") || plans[plans.length - 1];

  const members = [
    { customer: customers[0], plan: annual, startedDaysAgo: 40 },   // comfortably active
    { customer: customers[1], plan: monthly, startedDaysAgo: 28 },  // expires in ~2 days — the reminder case
    { customer: customers[2], plan: monthly, startedDaysAgo: 45 },  // already expired
  ];

  for (const m of members) {
    const startDate = daysAgo(m.startedDaysAgo);
    const expiresAt = new Date(startDate.getTime() + m.plan.durationDays * 24 * 3600 * 1000);
    const seq = await nextSeq(`sale:${ctx.branchId}`);
    const sale = await Sale.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
      saleNo: `R-${String(seq).padStart(5, "0")}`, at: startDate,
      staffId: ctx.userId, staffName: ctx.actorName,
      customerId: m.customer._id, customerName: m.customer.name,
      items: [{
        productId: new mongoose.Types.ObjectId(), name: `${m.plan.name} membership`,
        qty: 1, unitPrice: m.plan.price, lineCost: 0, lineNet: m.plan.price, returnedQty: 0,
      }],
      subtotal: m.plan.price, discount: 0, vat: 0, total: m.plan.price,
      payments: [{ method: "cash", amount: m.plan.price }],
    });

    const status = expiresAt < new Date() ? "expired" : "active";
    const subscription = await GymSubscription.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
      customerId: m.customer._id, customerName: m.customer.name,
      planId: m.plan._id, planName: m.plan.name,
      startDate, expiresAt, status, purchasedAt: startDate, saleId: sale._id,
    });

    await Customer.updateOne(
      { _id: m.customer._id },
      { $inc: { totalSpend: m.plan.price, visits: 1 }, $set: { lastSeen: startDate, lastBranchId: ctx.branchId } }
    );
    await bumpDailyMetric(ctx, ctx.branchId, localDay(startDate), { revenue: m.plan.price, profit: m.plan.price, txns: 1, payments: { cash: m.plan.price } });

    // Access control IS the product — issued on signup, same as the real
    // purchase route, reusing the loyalty module's QR card wholesale.
    await issueCardForCustomer(ctx, m.customer._id, "gym_signup");

    if (status === "active") {
      for (const daysBack of [5, 2]) {
        await GymCheckIn.create({
          accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
          customerId: m.customer._id, customerName: m.customer.name, subscriptionId: subscription._id,
          allowed: true, at: daysAgo(daysBack), byStaffId: ctx.userId, byStaffName: ctx.actorName,
        });
      }
    }
  }
}

async function seedJobTicket(ctx, business, byName, { title, reference, lines, deposit, stage }) {
  const rawLines = lines.map((l) => (l.productId ? { productId: l.productId, qty: l.qty } : l));
  const { lines: priced, subtotal } = await priceLines(ctx, rawLines);
  const totals = totalsFor(business, subtotal, 0);
  const seq = await nextSeq(`job:${ctx.branchId}`);
  const job = await Job.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
    jobNo: `J-${String(seq).padStart(5, "0")}`, title, reference, lines: priced, ...totals,
    deposit: money(deposit), depositMethod: "cash", stage,
    stageHistory: [{ stage: "received", at: daysAgo(3) }, { stage, at: daysAgo(1) }],
    promisedAt: daysAgo(-2), receivedAt: daysAgo(3), staffName: ctx.actorName,
  });
  return job;
}

async function seedElectronicsSerials(ctx, byName) {
  const phone = byName.get("iPhone 13 128GB")?.doc;
  if (!phone) return;
  phone.tracksSerials = true;
  phone.warrantyMonths = 12;
  await phone.save();
  const stock = await Inventory.findOne({ branchId: ctx.branchId, productId: phone._id });
  const count = stock?.stock || 4;
  for (let i = 1; i <= count; i++) {
    await Serial.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: phone._id, productName: phone.name,
      serialNo: `IMEI-${String(35000000 + i).padStart(9, "0")}`, status: "in_stock", at: daysAgo(15),
    });
  }
}

async function seedKitchenQueue(ctx, lastSale) {
  if (!lastSale?.items?.length) return;
  lastSale.items[0].prepStatus = "preparing";
  if (lastSale.items[1]) lastSale.items[1].prepStatus = "pending";
  await lastSale.save();
}

async function seedCreditCustomer(ctx, customers) {
  const debtor = customers[0];
  await applyCreditChange(ctx, { customer: debtor, type: "sale", amount: money(pick([4500, 6200, 8900])), refType: "manual", note: "Supplied on trust, pays end of week" });
}

// ── Orchestration ────────────────────────────────────────────────────

async function seedBusiness(typeKey, owner, account) {
  const shop = DEMOS[typeKey];
  const template = typeTemplate(typeKey);

  const business = await Business.create({
    accountId: account._id, name: shop.business, typeKey,
    settings: { currency: "₦", vatEnabled: true, vatRate: 7.5, modules: template.modules },
  });
  const branch = await Branch.create({ accountId: account._id, businessId: business._id, name: shop.branch.name, address: shop.branch.address });
  await Membership.create({ userId: owner._id, accountId: account._id, businessId: business._id, branchId: branch._id, role: "owner" });

  const amaka = await makeStaff({ account, business, branch, name: "Amaka Obi", role: "staff", pin: STAFF_PIN_STAFF, tag: typeKey });
  const chidi = await makeStaff({ account, business, branch, name: "Chidi Eze", role: "manager", pin: STAFF_PIN_MANAGER, tag: typeKey });

  const ctx = { accountId: account._id, businessId: business._id, branchId: branch._id, userId: owner._id, actorName: "Demo Owner", business };

  const byName = await seedCatalog(ctx, shop);

  const customers = [];
  for (const c of CUSTOMERS) customers.push(await Customer.create({ accountId: account._id, businessId: business._id, name: c.name, phone: c.phone, whatsapp: c.phone }));

  // The signature vertical logic each business exists to show off — seeded
  // BEFORE the random trading history below, which sells down whatever
  // stock is left over. Running it after would race the cohort's feed, the
  // production run's raw materials, and the serial count against however
  // much of that same stock the random simulation happened to sell first.
  if (typeKey === "hotel" && shop.rooms) await seedHotel(ctx, shop, byName);
  if (typeKey === "poultry") await seedPoultry(ctx, byName);
  if (typeKey === "water") { await seedWaterProduction(ctx, byName); await seedCreditCustomer(ctx, customers); }
  if (typeKey === "coldroom") { await seedColdroom(ctx, business, byName); await seedCreditCustomer(ctx, customers); }
  if (typeKey === "blinds") {
    const fabric = byName.get("Blackout Fabric (metre)")?.doc;
    await seedJobTicket(ctx, business, byName, {
      title: "3 windows — living room blinds", reference: "Aduke Residence, Lekki",
      lines: [
        ...(fabric ? [{ productId: String(fabric._id), qty: 8 }] : []),
        { name: "Installation labour", price: 15000, qty: 1 },
      ],
      deposit: 20000, stage: "in_progress",
    });
  }
  if (typeKey === "electronics") {
    await seedElectronicsSerials(ctx, byName);
    await seedJobTicket(ctx, business, byName, {
      title: "Cracked screen — iPhone 13", reference: "IMEI-035000003",
      lines: [{ name: "Screen replacement labour", price: 20000, qty: 1 }],
      deposit: 10000, stage: "ready",
    });
  }
  if (typeKey === "laundry") {
    await seedJobTicket(ctx, business, byName, {
      title: "Weekly drop-off — 3 shirts, 1 suit", reference: "Okafor Household",
      lines: [
        { name: "Dry Clean - Suit (2pc)", price: 5500, qty: 1 },
        { name: "Iron - Shirt", price: 400, qty: 3 },
      ],
      deposit: 0, stage: "ready",
    });
  }
  if (typeKey === "gym" && shop.gymPlans) await seedGym(ctx, shop, customers);

  const lastSale = await seedTradingHistory(ctx, byName, customers, [amaka, chidi, owner]);
  if (typeKey === "restaurant") await seedKitchenQueue(ctx, lastSale);

  // Two days of expenses + today's clock-in, same shape as the sandbox demo.
  for (const [type, amount, offset] of [["Fuel", 3800, 2], ["Transport", 1500, 1], ["Diesel", 12000, 0]]) {
    const at = daysAgo(offset);
    await Expense.create({ accountId: account._id, businessId: business._id, branchId: branch._id, type, amount, actorId: owner._id, actorName: "Demo Owner", at });
    await DailyMetric.findOneAndUpdate(
      { businessId: business._id, branchId: branch._id, date: localDay(at) },
      { $inc: { expenses: amount }, $setOnInsert: { accountId: account._id } }, { upsert: true }
    );
  }
  const clockIn = new Date(); clockIn.setHours(8, randInt(0, 10), 0, 0);
  await Attendance.create({ accountId: account._id, businessId: business._id, branchId: branch._id, userId: amaka._id, staffName: "Amaka Obi", date: localDay(), clockIn });

  // Every sandbox's "raise alerts now" step, so the bell isn't empty on login.
  try {
    const { scanStock, scanExpiry } = await import("#modules/alerts/alerts.service.js");
    await scanStock(business);
    await scanExpiry(business);
  } catch (err) {
    console.error(`  alert seeding failed for ${typeKey}:`, err.message);
  }

  return { business, branch, staffPins: { "Amaka Obi (staff)": STAFF_PIN_STAFF, "Chidi Eze (manager)": STAFF_PIN_MANAGER } };
}

async function main() {
  const reset = process.argv.includes("--reset");
  await connectDb();

  if (reset) {
    console.log("Resetting previous showcase data…");
    await wipeAllShowcaseData();
  }

  const results = [];
  for (const typeKey of Object.keys(DEMOS)) {
    const shop = DEMOS[typeKey];
    const { user: owner, account } = await getOrCreateOwner(typeKey, shop);

    const existingBusiness = await Business.findOne({ accountId: account._id, typeKey });
    if (existingBusiness) {
      console.log(`Skipping ${typeKey} — already seeded (business ${existingBusiness._id}). Run with --reset to rebuild.`);
      results.push({ typeKey, business: existingBusiness, ownerEmail: owner.email });
      continue;
    }

    console.log(`Seeding ${typeKey}…`);
    const { business } = await seedBusiness(typeKey, owner, account);
    results.push({ typeKey, business, ownerEmail: owner.email });
  }

  console.log("\n" + "=".repeat(72));
  console.log("StarTrack showcase — one independent owner login per business");
  console.log("=".repeat(72));
  for (const r of results) {
    const shop = DEMOS[r.typeKey];
    console.log(`— ${shop.label} (${shop.business})`);
    console.log(`    Owner login  →  ${r.ownerEmail}  /  ${OWNER_PASSWORD}`);
    console.log(`    Till login   →  business code ${r.business.code}, PIN ${STAFF_PIN_STAFF} (staff) or ${STAFF_PIN_MANAGER} (manager)`);
  }
  console.log("=".repeat(72));

  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
