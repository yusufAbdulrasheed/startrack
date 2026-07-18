import crypto from "node:crypto";
import { User } from "../models/User.js";
import { Account } from "../models/Account.js";
import { Business } from "../models/Business.js";
import { Branch } from "../models/Branch.js";
import { Membership } from "../models/Membership.js";
import { Product } from "../models/Product.js";
import { Inventory } from "../models/Inventory.js";
import { StockMovement } from "../models/StockMovement.js";
import { Sale } from "../models/Sale.js";
import { Return } from "../models/Return.js";
import { Customer } from "../models/Customer.js";
import { Expense } from "../models/Expense.js";
import { Attendance } from "../models/Attendance.js";
import { DailyMetric } from "../models/DailyMetric.js";
import { AuditLog } from "../models/AuditLog.js";
import { Counter, nextSeq } from "./counters.js";
import { hashPassword } from "./auth.js";
import { typeTemplate } from "./businessTypes.js";
import { money } from "./money.js";
import { localDay } from "./metrics.js";

const CATALOG = [
  { name: "Golden Penny Semovita 2kg", category: "Grains", price: 2000, cost: 1500, stock: 42, reorder: 10, barcode: "6156000112340" },
  { name: "Honeywell Noodles (single)", category: "Grains", price: 400, cost: 290, stock: 88, reorder: 30 },
  { name: "Indomie Chicken (carton)", category: "Grains", price: 3500, cost: 2900, stock: 14, reorder: 8 },
  { name: "Peak Milk 400g", category: "Dairy", price: 1500, cost: 1150, stock: 26, reorder: 15 },
  { name: "Milo 500g", category: "Dairy", price: 2800, cost: 2250, stock: 19, reorder: 10 },
  { name: "Bournvita 900g", category: "Dairy", price: 4200, cost: 3400, stock: 9, reorder: 6 },
  { name: "Kings Oil 5L", category: "Oils", price: 7500, cost: 6300, stock: 3, reorder: 10 }, // low stock on purpose
  { name: "Power Oil 3.5L", category: "Oils", price: 6200, cost: 5200, stock: 15, reorder: 8 },
  { name: "Dangote Sugar 1kg", category: "Baking", price: 900, cost: 700, stock: 5, reorder: 15 }, // low stock
  { name: "Golden Penny Flour 1kg", category: "Baking", price: 1100, cost: 850, stock: 22, reorder: 12 },
  { name: "Titus Sardine", category: "Canned", price: 1200, cost: 950, stock: 31, reorder: 20 },
  { name: "Maggi Cubes (roll)", category: "Spices", price: 600, cost: 420, stock: 64, reorder: 25 },
];

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
export async function createDemoSandbox() {
  const tag = crypto.randomBytes(4).toString("hex");
  const user = await User.create({
    name: "Demo Owner",
    email: `demo-${tag}@sandbox.startrack.local`,
    passwordHash: await hashPassword(crypto.randomBytes(12).toString("hex")),
  });
  const account = await Account.create({ name: "Sunrise Superstore", ownerUserId: user._id, isSandbox: true });
  const business = await Business.create({
    accountId: account._id,
    name: "Sunrise Superstore",
    typeKey: "retail",
    settings: { currency: "₦", vatEnabled: true, vatRate: 7.5, modules: typeTemplate("retail").modules },
  });
  const branch = await Branch.create({ accountId: account._id, businessId: business._id, name: "Main Branch", address: "12 Market Road" });
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
    });
    const opening = item.stock + 40; // sales below will eat into this
    await Inventory.create({ ...base, branchId: branch._id, productId: p._id, stock: opening });
    await StockMovement.create({
      ...base, branchId: branch._id, productId: p._id, productName: p.name,
      type: "IN", qty: opening, balanceAfter: opening, refType: "manual",
      reason: "Opening stock", actorId: user._id, actorName: "Demo Owner",
      at: new Date(Date.now() - 8 * 24 * 3600 * 1000),
    });
    products.push({ doc: p, ...item });
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
