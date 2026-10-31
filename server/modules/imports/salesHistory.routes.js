import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { Sale } from "#modules/sales/sale.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Product } from "#modules/products/product.model.js";
import { DailyMetric } from "#modules/metrics/dailyMetric.model.js";
import { ImportBatch } from "#modules/imports/importBatch.model.js";
import { Counter } from "#core/counters.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { parseUpload, UploadError, MAX_FILE_BYTES } from "#modules/imports/parseSheet.js";
import { guessColumns, cleanMapping, bestTable } from "#modules/imports/columns.js";
import { clean, normKey, parseCount, parseDate, parseMoney } from "#modules/imports/values.js";
import { customerRoom } from "#modules/customers/customerLimit.js";
import { scopedToBranch } from "#core/branchScope.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";
import { audit } from "#core/audit.js";

/**
 * Upload past sales from a spreadsheet so the dashboard, reports and customer
 * book start with the business's real history instead of a blank page.
 *
 * What it deliberately does NOT do: touch stock. These sales already happened
 * and their stock left the shelf long before StarTrack; subtracting it now
 * would make today's counts wrong. They count toward revenue, profit, daily
 * figures, customers and reports — and nothing else.
 *
 * The file is previewed (nothing written) and then saved by re-reading the same
 * file — the server never accepts rows from the browser. Every import is a
 * batch that can be undone.
 */
export const salesHistoryRouter = Router();
// Financial history changes every report, so it's the owner's call.
salesHistoryRouter.use(requirePerm("*"));

const MAX_ROWS = 20000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

const SPEC = {
  date: ["date", "sale date", "transaction date", "day", "order date", "datetime", "time"],
  receipt: ["receipt", "receipt no", "receipt number", "invoice", "invoice no", "order no", "order number", "transaction id", "reference", "ref", "sale id"],
  item: ["item", "product", "product name", "item name", "description", "goods", "service"],
  qty: ["qty", "quantity", "units", "pcs", "no of items", "number of items"],
  price: ["price", "unit price", "selling price", "rate", "price per item"],
  total: ["total", "line total", "amount", "sales amount", "value", "revenue", "sub total", "subtotal"],
  cost: ["cost", "unit cost", "cost price", "buying price"],
  customer: ["customer", "customer name", "client", "client name", "buyer"],
  phone: ["phone", "phone number", "mobile", "customer phone", "customer number"],
  payment: ["payment", "payment method", "paid by", "method", "mode of payment", "payment type"],
};

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const tail10 = (v) => digits(v).slice(-10);

function paymentOf(v) {
  const s = String(v ?? "").toLowerCase();
  if (/pos|card|debit|credit|visa|master|verve/.test(s)) return "pos";
  if (/transfer|bank|ussd|wire|online|paystack|opay|palmpay|moniepoint|kuda|wema|gtb|zenith/.test(s)) return "transfer";
  return "cash";
}

/** The calendar day the spreadsheet means, whatever timezone this server runs in. */
function dayOf(v) {
  const d = parseDate(v);
  if (!d) return null;
  const key = d.toISOString().slice(0, 10); // parseDate gives UTC noon / UTC midnight for a typed date
  const y = Number(key.slice(0, 4));
  const tomorrow = localDay(new Date(Date.now() + 86_400_000));
  if (y < 2000 || key > tomorrow) return null;
  return key;
}

const atNoon = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, 12, 0, 0); };
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 24);

/** Reserve `n` consecutive receipt numbers in one step. */
async function reserveSeq(scopeKey, n) {
  const doc = await Counter.findOneAndUpdate({ scopeKey }, { $inc: { seq: n } }, { new: true, upsert: true });
  return doc.seq - n + 1;
}

// GET /api/history-import/template.csv — a file to start from
salesHistoryRouter.get("/template.csv", (_req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="past-sales-template.csv"');
  res.send("﻿" + [
    "Date,Receipt No,Item,Quantity,Unit Price,Customer,Phone,Payment Method",
    "15/03/2025,R-0001,Premium Rice 5kg,2,5200,Ada Obi,08031234567,Cash",
    "15/03/2025,R-0001,Vegetable Oil 1L,1,2300,Ada Obi,08031234567,Cash",
    "16/03/2025,R-0002,Spaghetti 500g,10,650,,,Transfer",
  ].join("\r\n"));
});

// GET /api/history-import/batches — what's been uploaded before
salesHistoryRouter.get("/batches", async (req, res) => {
  const rows = await ImportBatch.find({ businessId: req.ctx.businessId }).sort({ createdAt: -1 }).limit(30);
  res.json({ batches: rows.map((b) => ({ id: String(b._id), fileName: b.fileName, status: b.status, sales: b.sales, revenue: b.revenue, from: b.from, to: b.to, newCustomers: b.newCustomers, newProducts: b.newProducts, createdBy: b.createdBy, createdAt: b.createdAt, undoneAt: b.undoneAt || null })) });
});

// POST /api/history-import/sales — preview (default) or save (commit=1) a file of past sales
salesHistoryRouter.post("/sales", requireBranch, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "invalid", message: "Choose a file to upload." });
  const ctx = req.ctx;
  let parsed;
  try {
    parsed = await parseUpload(req.file.buffer, req.file.originalname, { maxRows: MAX_ROWS });
  } catch (err) {
    if (err instanceof UploadError) return res.status(400).json({ error: "bad_file", message: err.message });
    throw err;
  }
  const table = bestTable(parsed.tables, SPEC);
  const mapping = { ...guessColumns(table.headers, SPEC), ...cleanMapping(req.body.mapping, table.headers, SPEC) };
  if (!mapping.date || !mapping.item || !mapping.qty || !(mapping.price || mapping.total)) {
    return res.status(422).json({ error: "no_columns", message: "I need columns for the date, the item, the quantity, and either the price or the line total. Choose them below.", headers: table.headers, mapping });
  }
  const commit = req.body.commit === "1";
  const cell = (row, f) => (mapping[f] ? row[mapping[f]] : "");

  // Read every row into a clean line, or say why not.
  const problems = [];
  const lines = [];
  const tally = { rows: table.rows.length, sales: 0, lines: 0, invalid: 0, duplicate: 0, newCustomers: 0, newProducts: 0, noCustomerSaved: 0 };
  for (const row of table.rows) {
    const date = dayOf(cell(row, "date"));
    const name = clean(cell(row, "item"), 140);
    const qty = parseCount(cell(row, "qty"));
    let price = parseMoney(cell(row, "price"));
    const lineTotal = parseMoney(cell(row, "total"));
    const fail = (reason) => { tally.invalid++; problems.push({ row: row.__row, reason }); };
    if (!date) { fail(`"${cell(row, "date") instanceof Date ? "that date" : cell(row, "date")}" isn't a usable date (use day/month/year, not in the future)`); continue; }
    if (!name) { fail("No item name"); continue; }
    if (qty === null || !(qty > 0) || qty > 1_000_000) { fail(`"${cell(row, "qty")}" isn't a valid quantity`); continue; }
    let net;
    if (price !== null && price >= 0) net = money(price * qty);
    else if (lineTotal !== null && lineTotal >= 0) { net = money(lineTotal); price = net / qty; }
    else { fail("No price or total"); continue; }
    if (lineTotal !== null && lineTotal >= 0 && price !== null && cell(row, "price") === "") net = money(lineTotal);
    const cost = parseMoney(cell(row, "cost"));
    lines.push({
      row: row.__row, date, name, qty, unitPrice: money(net / qty), net, cost: cost !== null && cost >= 0 ? cost : null,
      receipt: clean(cell(row, "receipt"), 60), customer: clean(cell(row, "customer"), 120), phone: String(cell(row, "phone") ?? "").replace(/[\s\-().]/g, ""),
      payment: paymentOf(cell(row, "payment")),
    });
  }

  // Lines of one receipt (same day) become one sale; with no receipt number each line stands alone.
  const groups = new Map();
  lines.forEach((l, i) => {
    const key = l.receipt ? `r|${l.date}|${normKey(l.receipt)}` : `l|${i}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });
  const occurrences = new Map();
  const sales = [...groups.values()].map((ls) => {
    const first = ls[0];
    const total = money(ls.reduce((t, l) => t + l.net, 0));
    // The same sale in the same file twice is a real second sale; the same file uploaded twice is not.
    const body = `${first.date}|${normKey(first.receipt)}|${ls.map((l) => `${normKey(l.name)}x${l.qty}@${l.net}`).sort().join(",")}|${normKey(first.customer)}|${first.payment}`;
    const n = (occurrences.get(body) || 0) + 1;
    occurrences.set(body, n);
    return { date: first.date, receipt: first.receipt, lines: ls, total, customer: first.customer, phone: first.phone, payment: first.payment, key: `imp:${hash(`${body}|${n}`)}`, firstRow: first.row };
  });

  // Skip what an earlier upload of the same data already recorded.
  const already = new Set((await Sale.find({ businessId: ctx.businessId, clientSaleId: { $in: sales.map((s) => s.key) } }).select("clientSaleId").lean()).map((s) => s.clientSaleId));
  const fresh = sales.filter((s) => !already.has(s.key));
  tally.duplicate = sales.length - fresh.length;
  tally.sales = fresh.length;
  tally.lines = fresh.reduce((t, s) => t + s.lines.length, 0);
  const days = fresh.map((s) => s.date).sort();
  const revenue = money(fresh.reduce((t, s) => t + s.total, 0));

  // Who the buyers are, and which items we'd have to create as archived placeholders.
  const catalog = await Product.find(scopedToBranch(ctx, { businessId: ctx.businessId })).select("name cost status").lean();
  const productBy = new Map();
  for (const p of catalog) { const k = normKey(p.name); if (!productBy.has(k) || p.status === "active") productBy.set(k, p); }
  const newItemNames = new Map();
  for (const s of fresh) for (const l of s.lines) { const k = normKey(l.name); if (!productBy.has(k) && !newItemNames.has(k)) newItemNames.set(k, l); }
  tally.newProducts = newItemNames.size;

  const people = await Customer.find({ businessId: ctx.businessId }).select("name phone").lean();
  const byPhone = new Map(people.filter((c) => tail10(c.phone).length >= 7).map((c) => [tail10(c.phone), c]));
  const byName = new Map(people.filter((c) => !c.phone).map((c) => [normKey(c.name), c]));
  const room = await customerRoom(ctx.businessId, ctx.plan);
  let roomLeft = room.remaining;
  const newPeople = new Map(); // key → { name, phone }
  const buyerOf = (s) => {
    const t = s.phone ? tail10(s.phone) : "";
    if (t.length >= 7) return { existing: byPhone.get(t), key: `p|${t}`, name: s.customer || s.phone, phone: s.phone };
    if (s.customer) return { existing: byName.get(normKey(s.customer)), key: `n|${normKey(s.customer)}`, name: s.customer, phone: "" };
    return null;
  };
  for (const s of fresh) {
    const b = buyerOf(s);
    s.buyer = b;
    if (!b || b.existing || newPeople.has(b.key)) continue;
    if (roomLeft > 0) { newPeople.set(b.key, { name: b.name, phone: b.phone }); roomLeft--; }
    else b.unsaved = true; // the sale keeps the name; they just don't join the customer book
  }
  tally.newCustomers = newPeople.size;
  tally.noCustomerSaved = fresh.filter((s) => s.buyer && !s.buyer.existing && !newPeople.has(s.buyer.key)).length;

  const report = {
    fileName: req.file.originalname, sheet: table.name, headers: table.headers, mapping, truncated: table.truncated, totals: tally,
    revenue, from: days[0] || "", to: days[days.length - 1] || "",
    sample: fresh.slice(0, 6).map((s) => ({ date: s.date, receipt: s.receipt, items: s.lines.map((l) => `${l.name} ×${l.qty}`).join(", "), total: s.total, customer: s.customer })),
    problems: problems.slice(0, 25), committed: false, created: 0,
  };
  if (!commit || !fresh.length) return res.json(report);

  // ── save ────────────────────────────────────────────────────────────────
  const batch = await ImportBatch.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, fileName: req.file.originalname, rows: tally.rows,
    sales: fresh.length, revenue, from: report.from, to: report.to, newCustomers: tally.newCustomers, newProducts: tally.newProducts, createdBy: ctx.actorName,
  });
  const batchId = batch._id;

  try {
    // Archived placeholders keep the item name on old receipts without cluttering the live catalog.
    const placeholders = [...newItemNames.values()].map((l) => ({ accountId: ctx.accountId, businessId: ctx.businessId, branchId: null, name: l.name, price: l.unitPrice, cost: l.cost ?? 0, status: "archived", importBatchId: batchId }));
    if (placeholders.length) {
      const made = await Product.insertMany(placeholders, { ordered: false });
      for (const p of made) productBy.set(normKey(p.name), p);
    }

    const earliest = new Map();
    for (const s of fresh) { const b = s.buyer; if (b && newPeople.has(b.key)) { const e = earliest.get(b.key); if (!e || s.date < e) earliest.set(b.key, s.date); } }
    const peopleDocs = [...newPeople.entries()].map(([key, p]) => ({ accountId: ctx.accountId, businessId: ctx.businessId, branchId: null, name: p.name, phone: p.phone, whatsapp: p.phone, source: "import", importBatchId: batchId, firstSeen: atNoon(earliest.get(key)), lastSeen: atNoon(earliest.get(key)) }));
    const madePeople = peopleDocs.length ? await Customer.insertMany(peopleDocs, { ordered: false }) : [];
    const customerByKey = new Map([...newPeople.keys()].map((k, i) => [k, madePeople[i]]));

    const start = await reserveSeq(`hist:${ctx.branchId}`, fresh.length);
    const saleDocs = fresh.map((s, i) => {
      const cust = s.buyer ? (s.buyer.existing || customerByKey.get(s.buyer.key)) : null;
      const items = s.lines.map((l) => {
        const p = productBy.get(normKey(l.name));
        const unitCost = l.cost ?? p?.cost ?? 0;
        return { productId: p._id, name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineCost: money(unitCost * l.qty), lineNet: l.net, returnedQty: 0, components: [] };
      });
      s.cost = money(items.reduce((t, it) => t + it.lineCost, 0));
      s.customerId = cust?._id;
      return {
        accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, saleNo: `H-${String(start + i).padStart(5, "0")}`, at: atNoon(s.date),
        staffId: ctx.userId, staffName: "Imported history", customerId: cust?._id, customerName: cust?.name || s.customer || "",
        items, subtotal: s.total, discount: 0, vat: 0, total: s.total, payments: [{ method: s.payment, amount: s.total }], status: "completed",
        channel: "import", importBatchId: batchId, clientSaleId: s.key,
      };
    });
    for (let i = 0; i < saleDocs.length; i += 500) await Sale.insertMany(saleDocs.slice(i, i + 500), { ordered: false });

    // Daily figures: one update per (day), not per sale.
    const perDay = new Map();
    for (const s of fresh) {
      const d = perDay.get(s.date) || { revenue: 0, cost: 0, txns: 0, cash: 0, pos: 0, transfer: 0 };
      d.revenue += s.total; d.cost += s.cost; d.txns += 1; d[s.payment] += s.total;
      perDay.set(s.date, d);
    }
    await DailyMetric.bulkWrite([...perDay.entries()].map(([date, d]) => ({
      updateOne: {
        filter: { businessId: ctx.businessId, branchId: ctx.branchId, date },
        update: { $inc: { revenue: money(d.revenue), cost: money(d.cost), profit: money(d.revenue - d.cost), txns: d.txns, "paymentSplit.cash": money(d.cash), "paymentSplit.pos": money(d.pos), "paymentSplit.transfer": money(d.transfer) }, $setOnInsert: { accountId: ctx.accountId } },
        upsert: true,
      },
    })));

    // Each customer's lifetime numbers.
    const perCustomer = new Map();
    for (const s of fresh) {
      if (!s.customerId) continue;
      const k = String(s.customerId);
      const c = perCustomer.get(k) || { id: s.customerId, spend: 0, visits: 0, first: s.date, last: s.date };
      c.spend += s.total; c.visits += 1; if (s.date < c.first) c.first = s.date; if (s.date > c.last) c.last = s.date;
      perCustomer.set(k, c);
    }
    if (perCustomer.size) {
      await Customer.bulkWrite([...perCustomer.values()].map((c) => ({
        updateOne: { filter: { _id: c.id }, update: { $inc: { totalSpend: money(c.spend), visits: c.visits }, $min: { firstSeen: atNoon(c.first) }, $max: { lastSeen: atNoon(c.last) } } },
      })));
    }
  } catch (err) {
    // Half an import is worse than none: take back whatever this attempt made.
    await rollback(ctx, batchId).catch(() => {});
    await ImportBatch.deleteOne({ _id: batchId }).catch(() => {});
    console.error("history import failed:", err.message);
    return res.status(500).json({ error: "import_failed", message: "Something went wrong while saving, so nothing was added. Please try again." });
  }

  audit(ctx, "history.import", { type: "business", id: ctx.businessId, label: req.file.originalname }, undefined, { sales: fresh.length, revenue });
  res.json({ ...report, committed: true, created: fresh.length, batchId: String(batchId) });
});

/** Remove everything a batch created and reverse what it added to the figures. */
async function rollback(ctx, batchId) {
  const sales = await Sale.find({ importBatchId: batchId, businessId: ctx.businessId }).select("at branchId total items payments customerId").lean();

  const perDay = new Map();
  const perCustomer = new Map();
  for (const s of sales) {
    const key = `${s.branchId}|${localDay(s.at)}`;
    const d = perDay.get(key) || { branchId: s.branchId, date: localDay(s.at), revenue: 0, cost: 0, txns: 0, cash: 0, pos: 0, transfer: 0 };
    d.revenue += s.total; d.cost += s.items.reduce((t, i) => t + (i.lineCost || 0), 0); d.txns += 1;
    for (const p of s.payments) d[p.method] += p.amount;
    perDay.set(key, d);
    if (s.customerId) { const c = perCustomer.get(String(s.customerId)) || { id: s.customerId, spend: 0, visits: 0 }; c.spend += s.total; c.visits += 1; perCustomer.set(String(s.customerId), c); }
  }
  if (perDay.size) {
    await DailyMetric.bulkWrite([...perDay.values()].map((d) => ({
      updateOne: { filter: { businessId: ctx.businessId, branchId: d.branchId, date: d.date }, update: { $inc: { revenue: -money(d.revenue), cost: -money(d.cost), profit: -money(d.revenue - d.cost), txns: -d.txns, "paymentSplit.cash": -money(d.cash), "paymentSplit.pos": -money(d.pos), "paymentSplit.transfer": -money(d.transfer) } } },
    })));
  }
  if (perCustomer.size) {
    await Customer.bulkWrite([...perCustomer.values()].map((c) => ({ updateOne: { filter: { _id: c.id }, update: { $inc: { totalSpend: -money(c.spend), visits: -c.visits } } } })));
  }
  await Sale.deleteMany({ importBatchId: batchId, businessId: ctx.businessId });
  // People and items this import had to create go with it — unless they've since been used elsewhere.
  await Customer.deleteMany({ importBatchId: batchId, businessId: ctx.businessId, visits: { $lte: 0 } });
  await Product.deleteMany({ importBatchId: batchId, businessId: ctx.businessId });
}

// POST /api/history-import/batches/:id/undo
salesHistoryRouter.post("/batches/:id/undo", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "not_found", message: "Upload not found." });
  const batch = await ImportBatch.findOneAndUpdate({ _id: req.params.id, businessId: req.ctx.businessId, status: "active" }, { $set: { status: "undone", undoneAt: new Date(), undoneBy: req.ctx.actorName } }, { new: true });
  if (!batch) return res.status(409).json({ error: "not_undoable", message: "That upload was already undone, or doesn't exist." });
  await rollback(req.ctx, batch._id);
  audit(req.ctx, "history.undo", { type: "business", id: req.ctx.businessId, label: batch.fileName }, undefined, { sales: batch.sales });
  res.json({ ok: true, removed: batch.sales });
});
