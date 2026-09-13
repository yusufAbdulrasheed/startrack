import crypto from "node:crypto";
import { User } from "#modules/auth/user.model.js";
import { Account } from "#modules/auth/account.model.js";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { StockMovement } from "#modules/inventory/stockMovement.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Return } from "#modules/returns/return.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { CustomerLedgerEntry } from "#modules/customers/customerLedger.model.js";
import { ColdRoomBatch } from "#modules/businesses/coldroom/batch.model.js";
import { ColdRoomBreakdown } from "#modules/businesses/coldroom/breakdown.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { Attendance } from "#modules/staff/attendance.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { AuditLog } from "#modules/audit/auditLog.model.js";
import { Counter, nextSeq } from "#core/counters.js";
import { hashPassword } from "#modules/auth/auth.service.js";
import { typeTemplate } from "#shared/businessTypes.js";
import { money } from "#core/money.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { DEMOS, DEMO_TYPES } from "#modules/auth/demoShops.js";


const CUSTOMER_NAMES = [
  { name: "Mama Nkechi", phone: "08031112233" },
  { name: "Alhaji Musa", phone: "08154445566" },
  { name: "Blessing Okoro", phone: "07067778899" },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

/**
 * Builds a fully-stocked sandbox business with a week of trading history.
 * Everything hangs off one Account flagged isSandbox — the cleanup sweep
 * removes the whole tree after 24h.
 */
export async function createDemoSandbox(requestedType = "restaurant") {
  const typeKey = DEMOS[requestedType] ? requestedType : "restaurant";
  const shop = DEMOS[typeKey];
  const template = typeTemplate(typeKey);
  const CATALOG = shop.catalog;
  const tag = crypto.randomBytes(4).toString("hex");
  const user = await User.create({
    name: "Demo Owner",
    email: `demo-${tag}@sandbox.startrack.local`,
    passwordHash: await hashPassword(crypto.randomBytes(12).toString("hex")),
  });
  const account = await Account.create({ name: shop.business, ownerUserId: user._id, isSandbox: true });
  const business = await Business.create({
    accountId: account._id,
    name: shop.business,
    typeKey,
    settings: { currency: "₦", vatEnabled: true, vatRate: 7.5, modules: template.modules },
  });
  const branch = await Branch.create({ accountId: account._id, businessId: business._id, name: shop.branch.name, address: shop.branch.address });
  const membership = await Membership.create({
    userId: user._id, accountId: account._id, businessId: business._id, branchId: null, role: "owner",
  });

  const base = { accountId: account._id, businessId: business._id };
  const ownerCtx = { ...base, branchId: branch._id, userId: user._id, actorName: "Demo Owner" };

  // Team: two till staff with PINs the visitor can try.
  const mkStaff = async (name, role, pin) => {
    const u = await User.create({
      name,
      email: `demo-${tag}-${name.split(" ")[0].toLowerCase()}@sandbox.startrack.local`,
      passwordHash: await hashPassword(crypto.randomBytes(12).toString("hex")),
    });
    await Membership.create({
      userId: u._id, accountId: account._id, businessId: business._id, branchId: branch._id,
      role, pinHash: await hashPassword(pin),
    });
    return u;
  };
  const amaka = await mkStaff("Amaka Obi", "staff", "1111");
  const chidi = await mkStaff("Chidi Eze", "manager", "2222");

  // Catalog + opening stock (through the ledger, like real life).
  const products = [];
  for (const item of CATALOG) {
    const p = await Product.create({
      ...base, name: item.name, category: item.category, barcode: item.barcode || "",
      price: item.price, cost: item.cost, reorderLevel: item.reorder,
      ...(item.expiry ? { expiry: item.expiry } : {}),
    });
    const opening = item.stock + 40; // padding for the week of sales; a stock count at the end lands it exactly
    await Inventory.create({ ...base, branchId: branch._id, productId: p._id, stock: opening });
    await StockMovement.create({
      ...base, branchId: branch._id, productId: p._id, productName: p.name,
      type: "IN", qty: opening, balanceAfter: opening, refType: "manual",
      reason: "Opening stock", actorId: user._id, actorName: "Demo Owner",
      at: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    });
    products.push({ doc: p, ...item });
  }

  // Made-to-order: the item itself holds no stock — selling one consumes the
  // components below, which is the whole point of the archetype.
  if (shop.madeToOrder) {
    const byName = new Map(products.map((p) => [p.name, p.doc]));
    const bom = shop.madeToOrder.bom
      .map((b) => ({ productId: byName.get(b.component)?._id, per: b.per, factor: b.factor }))
      .filter((b) => b.productId);
    if (bom.length) {
      await Product.create({
        ...base,
        name: shop.madeToOrder.name,
        category: shop.madeToOrder.category,
        archetype: "made_to_order",
        price: shop.madeToOrder.price,
        cost: 0,
        reorderLevel: 0,
        bom,
      });
    }
  }

  const customers = [];
  for (const c of CUSTOMER_NAMES) {
    customers.push(await Customer.create({ ...base, name: c.name, phone: c.phone, whatsapp: c.phone }));
  }

  // Seven days of trading, today included.
  const sellers = [
    { id: amaka._id, name: "Amaka Obi" },
    { id: chidi._id, name: "Chidi Eze" },
    { id: user._id, name: "Demo Owner" },
  ];
  let lastSale = null;
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const salesToday = dayOffset === 0 ? randInt(3, 5) : randInt(2, 6);
    for (let s = 0; s < salesToday; s++) {
      const at = new Date();
      at.setDate(at.getDate() - dayOffset);
      at.setHours(randInt(8, 19), randInt(0, 59), 0, 0);
      if (at > new Date()) at.setHours(new Date().getHours() - 1);

      const lineCount = randInt(1, 3);
      const chosen = new Map();
      for (let i = 0; i < lineCount; i++) {
        const prod = pick(products);
        chosen.set(String(prod.doc._id), { prod, qty: (chosen.get(String(prod.doc._id))?.qty || 0) + randInt(1, 3) });
      }
      const items = [...chosen.values()].map(({ prod, qty }) => ({
        productId: prod.doc._id, name: prod.name, qty,
        unitPrice: prod.price, lineCost: money(prod.cost * qty), lineNet: money(prod.price * qty),
        returnedQty: 0,
      }));
      const subtotal = money(items.reduce((sum, i) => sum + i.lineNet, 0));
      const discount = Math.random() < 0.25 ? money(Math.min(200, subtotal * 0.05)) : 0;
      const vat = money((subtotal - discount) * 0.075);
      const total = money(subtotal - discount + vat);
      const method = pick(["cash", "cash", "pos", "transfer"]);
      const seller = pick(sellers);
      const customer = Math.random() < 0.4 ? pick(customers) : null;

      // Stock walks down through the ledger, exactly like real checkout.
      for (const line of items) {
        const inv = await Inventory.findOneAndUpdate(
          { branchId: branch._id, productId: line.productId },
          { $inc: { stock: -line.qty } },
          { new: true }
        );
        await StockMovement.create({
          ...base, branchId: branch._id, productId: line.productId, productName: line.name,
          type: "OUT", qty: -line.qty, balanceAfter: inv.stock, refType: "sale",
          reason: "Sale", actorId: seller.id, actorName: seller.name, at,
        });
      }
      const seq = await nextSeq(`sale:${branch._id}`);
      lastSale = await Sale.create({
        ...base, branchId: branch._id, saleNo: `R-${String(seq).padStart(5, "0")}`, at,
        staffId: seller.id, staffName: seller.name,
        customerId: customer?._id, customerName: customer?.name || "",
        items, subtotal, discount, vat, total,
        payments: [{ method, amount: total }],
      });
      if (customer) {
        customer.totalSpend = money(customer.totalSpend + total);
        customer.visits += 1;
        customer.lastSeen = at;
        customer.lastBranchId = branch._id;
        await customer.save();
      }
      const totalCost = money(items.reduce((sum, i) => sum + i.lineCost, 0));
      await DailyMetric.findOneAndUpdate(
        { businessId: business._id, branchId: branch._id, date: localDay(at) },
        {
          $inc: {
            revenue: total, cost: totalCost, profit: money(total - vat - totalCost), txns: 1,
            discountTotal: discount, vatTotal: vat, [`paymentSplit.${method}`]: total,
          },
          $setOnInsert: { accountId: account._id },
        },
        { upsert: true }
      );
    }
  }

  // Final stock count: reconcile every product to its designed level
  // (including the deliberately-low ones) via honest ADJUST movements.
  for (const item of products) {
    const inv = await Inventory.findOne({ branchId: branch._id, productId: item.doc._id });
    const delta = item.stock - (inv?.stock ?? 0);
    if (delta !== 0 && inv) {
      inv.stock = item.stock;
      await inv.save();
      await StockMovement.create({
        ...base, branchId: branch._id, productId: item.doc._id, productName: item.name,
        type: "ADJUST", qty: delta, balanceAfter: item.stock, refType: "manual",
        reason: "Weekly stock count", actorId: chidi._id, actorName: "Chidi Eze",
      });
    }
  }

  // A return waiting for the visitor to approve — the workflow demo.
  if (lastSale) {
    const line = lastSale.items[0];
    await Return.create({
      ...base, branchId: branch._id, saleId: lastSale._id, saleNo: lastSale.saleNo,
      items: [{ productId: line.productId, name: line.name, qty: 1, unitPrice: money(line.lineNet / line.qty), unitCost: money(line.lineCost / line.qty) }],
      refund: { method: "cash", amount: money((line.lineNet / line.qty) * 1.075) },
      reason: "Customer changed their mind",
      requestedBy: amaka._id, requestedByName: "Amaka Obi",
    });
  }

  // Yesterday's expenses and today's clock-in round out the picture.
  for (const [type, amount, offset] of [["Fuel", 3500, 1], ["Transport", 1200, 0]]) {
    const at = new Date(Date.now() - offset * 24 * 3600 * 1000);
    await Expense.create({ ...base, branchId: branch._id, type, amount, actorId: user._id, actorName: "Demo Owner", at });
    await DailyMetric.findOneAndUpdate(
      { businessId: business._id, branchId: branch._id, date: localDay(at) },
      { $inc: { expenses: amount }, $setOnInsert: { accountId: account._id } },
      { upsert: true }
    );
  }
  const clockIn = new Date();
  clockIn.setHours(8, 2, 0, 0);
  await Attendance.create({
    ...base, branchId: branch._id, userId: amaka._id, staffName: "Amaka Obi",
    date: localDay(), clockIn,
  });

  // Opening stock was padded so a week of trading had something to eat into,
  // and those sales are random — which left every shelf comfortably full and
  // made each demo's "low stock is already waiting" promise untrue.
  //
  // Close the week with a stock count that lands each line exactly where the
  // shop intends it. Real shops count their shelves; this one just does it on
  // the way out, so the sandbox always opens with the situation it advertises.
  const countAt = new Date(Date.now() - 30 * 60 * 1000);
  for (const item of products) {
    const inv = await Inventory.findOne({ branchId: branch._id, productId: item.doc._id });
    const current = inv?.stock ?? 0;
    const delta = item.stock - current;
    if (delta === 0) continue;
    await Inventory.updateOne({ _id: inv._id }, { $set: { stock: item.stock } });
    await StockMovement.create({
      ...base, branchId: branch._id, productId: item.doc._id, productName: item.doc.name,
      type: "ADJUST", qty: delta, balanceAfter: item.stock, refType: "manual",
      reason: "Stock count", actorId: user._id, actorName: "Demo Owner", at: countAt,
    });
  }

  // A hotel's rooms are not stock, so they are seeded as rooms — with guests
  // already in house, arrivals due and one room out of service, so the heat
  // map has something real on it the moment the sandbox opens.
  if (shop.rooms) {
    const { RoomType, Room } = await import("#modules/businesses/hotel/room.model.js");
    const { Stay } = await import("#modules/businesses/hotel/stay.model.js");
    const day = (offset) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const typeByName = new Map();
    for (const t of shop.rooms.types) {
      const doc = await RoomType.create({ ...base, name: t.name, rate: t.rate, capacity: t.capacity, amenities: t.amenities });
      typeByName.set(t.name, doc);
    }

    const roomByNumber = new Map();
    for (const r of shop.rooms.list) {
      const type = typeByName.get(r.type);
      const doc = await Room.create({
        ...base, branchId: branch._id, roomTypeId: type._id, number: r.number,
        floor: r.floor || "", housekeeping: r.housekeeping || "clean", note: r.note || "",
      });
      roomByNumber.set(r.number, { doc, type });
    }

    const productByName = new Map(products.map((p) => [p.name, p]));
    for (const s of shop.rooms.stays) {
      const room = roomByNumber.get(s.room);
      if (!room) continue;
      const checkIn = day(s.from);
      const checkOut = day(s.to);
      const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86_400_000);
      const rate = room.type.rate;

      // Room nights first, then whatever the guest has ordered so far.
      const charges = [];
      for (let i = 0; i < nights; i++) {
        charges.push({
          at: new Date(), source: "room",
          name: `${room.doc.number} · ${room.type.name} · ${day(s.from + i)}`,
          qty: 1, unitPrice: rate, lineCost: 0, lineNet: rate, byName: "Demo Owner",
        });
      }
      for (const extra of s.extras || []) {
        const p = productByName.get(extra);
        if (!p) continue;
        charges.push({
          at: new Date(), source: /Laundry/.test(extra) ? "laundry" : /Beer|Drink/.test(extra) ? "bar" : "kitchen",
          productId: p.doc._id, name: p.name, qty: 1, unitPrice: p.price,
          lineCost: p.cost, lineNet: p.price, byName: "Amaka Obi", stockMoved: false,
        });
      }

      const seq = await nextSeq(`folio:${branch._id}`);
      await Stay.create({
        ...base, branchId: branch._id,
        folioNo: `F-${String(seq).padStart(5, "0")}`,
        roomId: room.doc._id, roomNumber: room.doc.number, roomTypeName: room.type.name,
        guestName: s.guest, guestPhone: s.phone || "",
        guests: 1, checkIn, checkOut, nights, nightlyRate: rate,
        status: s.status,
        checkedInAt: s.status === "checked_in" || s.status === "checked_out" ? new Date(`${checkIn}T14:00:00`) : undefined,
        checkedOutAt: s.status === "checked_out" ? new Date(`${checkOut}T11:00:00`) : undefined,
        charges, payments: [], staffName: "Demo Owner",
      });
    }
  }

  // Raise the alerts this shop's stock situation implies, so a visitor sees
  // the bell populated the moment they land rather than waiting for a sweep.
  try {
    const { scanStock, scanExpiry } = await import("#modules/alerts/alerts.service.js");
    await scanStock(business);
    await scanExpiry(business);
  } catch (err) {
    console.error("demo alert seeding failed:", err.message);
  }

  return { user, account, business, branch, membership };
}

/**
 * Removes sandbox accounts older than 24h — the whole tenant tree.
 * Called on boot and hourly.
 */
export async function cleanupSandboxes() {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const stale = await Account.find({ isSandbox: true, createdAt: { $lt: cutoff } }).select("_id");
  if (!stale.length) return 0;
  const ids = stale.map((a) => a._id);

  const branches = await Branch.find({ accountId: { $in: ids } }).select("_id");
  const branchIds = branches.map((b) => b._id);

  const byAccount = { accountId: { $in: ids } };
  await Promise.all([
    Product.deleteMany(byAccount), Inventory.deleteMany(byAccount), StockMovement.deleteMany(byAccount),
    Sale.deleteMany(byAccount), Return.deleteMany(byAccount), Customer.deleteMany(byAccount),
    CustomerLedgerEntry.deleteMany(byAccount),
    ColdRoomBatch.deleteMany(byAccount), ColdRoomBreakdown.deleteMany(byAccount),
    Expense.deleteMany(byAccount), Attendance.deleteMany(byAccount), DailyMetric.deleteMany(byAccount),
    AuditLog.deleteMany(byAccount), Branch.deleteMany(byAccount), Business.deleteMany(byAccount),
    Counter.deleteMany({ scopeKey: { $in: branchIds.map((b) => `sale:${b}`) } }),
  ]);
  const memberships = await Membership.find(byAccount).select("userId");
  await User.deleteMany({ _id: { $in: memberships.map((m) => m.userId) } });
  await Membership.deleteMany(byAccount);
  await Account.deleteMany({ _id: { $in: ids } });
  console.log(`🧹 Cleaned ${ids.length} expired demo sandbox(es)`);
  return ids.length;
}
