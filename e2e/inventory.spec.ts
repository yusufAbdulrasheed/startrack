import { expect, test } from "@playwright/test";
import { closeDb, movementsFor, productInBusiness, productDoc, seedProduct, setTrialEnd, stockLevel } from "./support/db";
import { newOwner, uploadCsv } from "./support/owner";

/**
 * The inventory hub: what's on the shelf, what it's worth, what sells, what to
 * reorder, opening-stock upload, and purchase orders that book goods in.
 */
test.afterAll(closeDb);

const sell = (request: any, o: any, productId: string, qty: number) =>
  request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty }], payments: [{ method: "cash", amount: 0 }] } });

async function sale(request: any, o: any, productId: string, qty: number, price: number) {
  const r = await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty }], payments: [{ method: "cash", amount: price * qty }] } });
  expect(r.status()).toBe(201);
}

test.describe("Stock overview", () => {
  test("lists every item with its level and status, and totals the whole shelf", async ({ request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 50, { cost: 700, reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 4, { cost: 500, reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Salt", 200, 0, { cost: 100, reorderLevel: 5, category: "Cooking" });

    const r = await (await request.get("/api/inventory/overview", { headers: o.headers })).json();
    expect(r.total).toBe(3);
    const by = Object.fromEntries(r.items.map((i: any) => [i.name, i]));
    expect(by.Rice.status).toBe("ok");
    expect(by.Beans.status).toBe("low");
    expect(by.Salt.status).toBe("out");
    // 50×700 + 4×500 = 37,000 at cost; 50×1000 + 4×800 = 53,200 at retail
    expect(r.summary).toMatchObject({ items: 3, units: 54, low: 1, out: 1, stockValue: 37000, retailValue: 53200, potentialProfit: 16200 });
    expect(by.Rice.stockValue).toBe(35000);
    expect(r.categories).toEqual(["Cooking", "Grains"]);
  });

  test("filters by status, search and category, and sorts the neediest first", async ({ request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 50, { reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 4, { reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Salt", 200, 0, { reorderLevel: 5, category: "Cooking" });
    const get = async (qs: string) => (await (await request.get(`/api/inventory/overview?${qs}`, { headers: o.headers })).json()).items.map((i: any) => i.name);

    expect(await get("status=low")).toEqual(["Beans"]);
    expect(await get("status=out")).toEqual(["Salt"]);
    expect(await get("q=ric")).toEqual(["Rice"]);
    expect(await get("category=Cooking")).toEqual(["Salt"]);
    expect(await get("sort=status")).toEqual(["Salt", "Beans", "Rice"]); // out, then low, then fine
    // The headline totals ignore the filter: they're the whole shelf.
    const filtered = await (await request.get("/api/inventory/overview?status=out", { headers: o.headers })).json();
    expect(filtered.summary.items).toBe(3);
  });

  test("never lists archived products or another store's stock", async ({ request }) => {
    const a = await newOwner(request, "a");
    const b = await newOwner(request, "b");
    await seedProduct(a.accountId, a.businessId, a.branchId, "Mine", 100, 5);
    await seedProduct(b.accountId, b.businessId, b.branchId, "Theirs", 100, 5);
    const items = (await (await request.get("/api/inventory/overview", { headers: a.headers })).json()).items.map((i: any) => i.name);
    expect(items).toEqual(["Mine"]);
  });

  test("exports a CSV that Excel can open safely", async ({ request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 5, { cost: 600 });
    await seedProduct(o.accountId, o.businessId, o.branchId, '=HYPERLINK("http://evil.test","click")', 100, 1);
    const r = await request.get("/api/inventory/export.csv", { headers: o.headers });
    expect(r.status()).toBe(200);
    expect(r.headers()["content-type"]).toContain("text/csv");
    expect(r.headers()["content-disposition"]).toContain("inventory-");
    const text = await r.text();
    expect(text.startsWith("﻿Name,SKU")).toBe(true);
    expect(text).toContain("Rice");
    expect(text).toContain("Stock value");
    // A product name that starts with "=" must not run as a spreadsheet formula.
    expect(text).not.toMatch(/(^|\n)=HYPERLINK/);
    expect(text).toContain("'=HYPERLINK");
  });
});

test.describe("Valuation and movers", () => {
  test("values the shelf at cost and retail, by category and by biggest holdings", async ({ request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 50, { cost: 700, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Salt", 200, 100, { cost: 100, category: "Cooking" });
    const v = await (await request.get("/api/inventory/valuation", { headers: o.headers })).json();
    expect(v.totals).toMatchObject({ items: 2, units: 150, atCost: 45000, atRetail: 70000, potentialProfit: 25000 });
    expect(v.byCategory[0]).toMatchObject({ category: "Grains", atCost: 35000 });
    expect(v.byCategory[0].sharePct).toBeCloseTo(77.8, 1);
    expect(v.topByValue[0].name).toBe("Rice");
  });

  test("shows what's selling fast, what's about to run out, and what hasn't moved", async ({ request }) => {
    const o = await newOwner(request);
    const hot = await seedProduct(o.accountId, o.businessId, o.branchId, "Hot Item", 100, 50, { cost: 50 });
    const dying = await seedProduct(o.accountId, o.businessId, o.branchId, "Almost Gone", 100, 10, { cost: 50 });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Dusty Item", 100, 30, { cost: 50 });
    await sale(request, o, hot, 20, 100);   // 20 in 30 days → ~0.67/day, 30 left → 45 days of cover
    await sale(request, o, dying, 9, 100);  // 9 in 30 days → 0.3/day, only 1 left ≈ 3 days

    const m = await (await request.get("/api/inventory/movers?days=30", { headers: o.headers })).json();
    expect(m.fast.map((r: any) => r.name)).toEqual(["Hot Item", "Almost Gone"]);
    expect(m.fast[0]).toMatchObject({ sold: 20, revenue: 2000 });
    expect(m.runningOut.map((r: any) => r.name)).toEqual(["Almost Gone"]);
    expect(m.runningOut[0].coverDays).toBeLessThanOrEqual(7);
    expect(m.dead.map((r: any) => r.name)).toEqual(["Dusty Item"]); // stock, but nothing sold
  });
});

test.describe("Reorder suggestions", () => {
  test("suggests what to buy, how many, and who you bought it from last time", async ({ request }) => {
    const o = await newOwner(request);
    const sup = await (await request.post("/api/suppliers", { headers: o.headers, data: { name: "Mama Put Foods", contact: "08033334444" } })).json();
    const supplierId = sup.supplier?.id || sup.id;
    const low = await seedProduct(o.accountId, o.businessId, o.branchId, "Low Item", 500, 1, { cost: 300, reorderLevel: 10 });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Fine Item", 500, 100, { cost: 300, reorderLevel: 10 });
    // A delivery on record gives the supplier and the last price paid.
    const si = await request.post("/api/inventory/stock-in", { headers: o.headers, data: { items: [{ productId: low, qty: 5, unitCost: 320 }], supplierId } });
    expect(si.status()).toBe(201);

    const r = await (await request.get("/api/inventory/reorder", { headers: o.headers })).json();
    expect(r.items.map((i: any) => i.name)).toEqual(["Low Item"]); // the well-stocked item isn't suggested
    const item = r.items[0];
    expect(item.suggested).toBeGreaterThanOrEqual(14); // enough for two reorder levels (20) minus the 6 on hand
    expect(item.supplierName).toBe("Mama Put Foods");
    expect(item.unitCost).toBe(320);
    expect(r.suppliers[0]).toMatchObject({ supplierName: "Mama Put Foods", count: 1 });
  });
});

test.describe("Opening stock upload", () => {
  const CSV = `Product,SKU,Qty,Cost Price,Selling Price
Rice,,40,650,900
Beans,,5,400,
Brand New Item,,12,100,250
Ghost Item,,3,,
Bad Qty,,abc,,
`;

  test("previews exactly what would change and writes nothing", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 10, { cost: 700 });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 5, { cost: 500 }); // already 5, but the file has a different cost

    const r = await (await uploadCsv(request, "/api/inventory/import", o, CSV, { createMissing: "1" })).json();
    expect(r.committed).toBe(false);
    expect(r.mapping).toMatchObject({ name: "Product", quantity: "Qty", cost: "Cost Price", price: "Selling Price" });
    // Rice: 10→40. Beans: same count but a new cost, so still a change. Brand New Item has a price, so it can be created.
    // Ghost Item has no price to create it with; "abc" isn't a quantity.
    expect(r.totals).toMatchObject({ rows: 5, update: 2, create: 1, unchanged: 0, missing: 1, invalid: 1 });
    expect(r.sample[0]).toMatchObject({ name: "Rice", before: 10, after: 40 });
    expect(await stockLevel(o.branchId, rice)).toBe(10); // nothing happened
  });

  test("saves: sets the counts through the stock ledger, updates costs, and can create what's missing", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 10, { cost: 700 });
    const beans = await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 50, { cost: 500 });
    const csv = `Product,Qty,Cost,Price\nRice,40,650,950\nBeans,20,,\nBrand New Item,12,100,250\n`;

    const r = await (await uploadCsv(request, "/api/inventory/import", o, csv, { commit: "1", createMissing: "1" })).json();
    expect(r.committed).toBe(true);
    expect(r.updated).toBe(2);
    expect(r.created).toBe(1);

    expect(await stockLevel(o.branchId, rice)).toBe(40);   // counted up
    expect(await stockLevel(o.branchId, beans)).toBe(20);  // counted down
    expect((await productDoc(rice))!.cost).toBe(650);       // the new cost and price came with it
    expect((await productDoc(rice))!.price).toBe(950);
    const made = await productInBusiness(o.businessId, "Brand New Item");
    expect(made).toBeTruthy();
    expect(await stockLevel(o.branchId, String(made!._id))).toBe(12);

    // Every change is in the ledger, so the audit trail explains the numbers.
    const ledger = await movementsFor(rice);
    expect(ledger.at(-1)).toMatchObject({ type: "IN", qty: 30, balanceAfter: 40, reason: "Opening stock (import)" });
    expect((await movementsFor(beans)).at(-1)).toMatchObject({ type: "ADJUST", qty: -30, balanceAfter: 20 });
  });

  test("leaves unknown products out unless asked to create them", async ({ request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 10);
    const r = await (await uploadCsv(request, "/api/inventory/import", o, "Name,Qty\nRice,15\nStranger,5\n", { commit: "1" })).json();
    expect(r.updated).toBe(1);
    expect(r.created).toBe(0);
    expect(r.totals.missing).toBe(1);
    expect(await productInBusiness(o.businessId, "Stranger")).toBeNull();
  });

  test("is a Pro feature (on the trial, paused after)", async ({ request }) => {
    const o = await newOwner(request);
    await setTrialEnd(o.accountId, -1);
    const r = await uploadCsv(request, "/api/inventory/import", o, "Name,Qty\nRice,1\n");
    expect(r.status()).toBe(403);
    expect((await r.json()).error).toBe("plan_required");
  });
});

test.describe("Purchase orders", () => {
  async function setup(request: any) {
    const o = await newOwner(request);
    const sup = await (await request.post("/api/suppliers", { headers: o.headers, data: { name: "Dangote Dist", contact: "08011112222" } })).json();
    const supplierId = sup.supplier?.id || sup.id;
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 2, { cost: 700 });
    const oil = await seedProduct(o.accountId, o.businessId, o.branchId, "Oil", 2000, 1, { cost: 1500 });
    return { o, supplierId, rice, oil };
  }

  test("a draft becomes an order you send, with a message ready to share", async ({ request }) => {
    const { o, supplierId, rice, oil } = await setup(request);
    const created = await request.post("/api/purchase-orders", { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 20, unitCost: 720 }, { productId: oil, qty: 5, unitCost: 1550 }], notes: "Morning delivery please" } });
    expect(created.status()).toBe(201);
    const po = (await created.json()).order;
    expect(po.poNo).toBe("PO-0001");
    expect(po.status).toBe("draft");
    expect(po.total).toBe(20 * 720 + 5 * 1550);
    expect(po.supplierName).toBe("Dangote Dist"); // from the supplier record, not typed

    // A draft can still be changed.
    const edited = await request.put(`/api/purchase-orders/${po.id}`, { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 30, unitCost: 720 }] } });
    expect((await edited.json()).order.total).toBe(30 * 720);

    const sent = await (await request.post(`/api/purchase-orders/${po.id}/send`, { headers: o.headers })).json();
    expect(sent.order.status).toBe("sent");
    expect(sent.shareText).toContain("PO-0001");
    expect(sent.shareText).toContain("Rice × 30");
    expect(sent.whatsappUrl).toContain("wa.me/2348011112222"); // a Nigerian 0… number becomes 234…

    // Once sent, it's locked.
    const locked = await request.put(`/api/purchase-orders/${po.id}`, { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 1, unitCost: 1 }] } });
    expect(locked.status()).toBe(409);
  });

  test("goods arrive in two deliveries: stock rises each time, cost is updated, and the ledger names the supplier", async ({ request }) => {
    const { o, supplierId, rice } = await setup(request);
    const po = (await (await request.post("/api/purchase-orders", { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 30, unitCost: 760 }] } })).json()).order;
    await request.post(`/api/purchase-orders/${po.id}/send`, { headers: o.headers });

    const first = await (await request.post(`/api/purchase-orders/${po.id}/receive`, { headers: o.headers, data: { lines: [{ productId: rice, qty: 12 }] } })).json();
    expect(first.order.status).toBe("partial");
    expect(first.order.lines[0].receivedQty).toBe(12);
    expect(first.order.outstandingUnits).toBe(18);
    expect(await stockLevel(o.branchId, rice)).toBe(14); // 2 on hand + 12
    expect((await productDoc(rice))!.cost).toBe(760);     // last cost paid

    const second = await (await request.post(`/api/purchase-orders/${po.id}/receive`, { headers: o.headers, data: { lines: [{ productId: rice, qty: 18, unitCost: 770 }] } })).json();
    expect(second.order.status).toBe("received");
    expect(second.order.receipts).toHaveLength(2);
    expect(await stockLevel(o.branchId, rice)).toBe(32);

    const last = (await movementsFor(rice)).at(-1)!;
    expect(last).toMatchObject({ type: "IN", qty: 18, unitCost: 770, supplierName: "Dangote Dist", refType: "purchase_order" });

    // A received order can't be received or cancelled again.
    expect((await request.post(`/api/purchase-orders/${po.id}/receive`, { headers: o.headers, data: { lines: [{ productId: rice, qty: 1 }] } })).status()).toBe(409);
    expect((await request.post(`/api/purchase-orders/${po.id}/cancel`, { headers: o.headers })).status()).toBe(409);
  });

  test("you can't receive more than was ordered, or something that isn't on the order", async ({ request }) => {
    const { o, supplierId, rice, oil } = await setup(request);
    const po = (await (await request.post("/api/purchase-orders", { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 10, unitCost: 700 }] } })).json()).order;
    const over = await request.post(`/api/purchase-orders/${po.id}/receive`, { headers: o.headers, data: { lines: [{ productId: rice, qty: 11 }] } });
    expect(over.status()).toBe(400);
    expect((await over.json()).message).toContain("only 10 still to come");
    const stranger = await request.post(`/api/purchase-orders/${po.id}/receive`, { headers: o.headers, data: { lines: [{ productId: oil, qty: 1 }] } });
    expect(stranger.status()).toBe(400);
    expect(await stockLevel(o.branchId, rice)).toBe(2); // nothing moved
  });

  test("cancelling before anything arrives cancels; after a delivery it closes what's left", async ({ request }) => {
    const { o, supplierId, rice } = await setup(request);
    const make = async () => (await (await request.post("/api/purchase-orders", { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 10, unitCost: 700 }] } })).json()).order;
    const a = await make();
    expect((await (await request.post(`/api/purchase-orders/${a.id}/cancel`, { headers: o.headers })).json()).order.status).toBe("cancelled");

    const b = await make();
    await request.post(`/api/purchase-orders/${b.id}/send`, { headers: o.headers });
    await request.post(`/api/purchase-orders/${b.id}/receive`, { headers: o.headers, data: { lines: [{ productId: rice, qty: 4 }] } });
    expect((await (await request.post(`/api/purchase-orders/${b.id}/cancel`, { headers: o.headers })).json()).order.status).toBe("closed");
    expect(await stockLevel(o.branchId, rice)).toBe(6); // the 4 that arrived stay on the shelf

    const open = await (await request.get("/api/purchase-orders?status=open", { headers: o.headers })).json();
    expect(open.orders).toHaveLength(0);
    const all = await (await request.get("/api/purchase-orders?status=all", { headers: o.headers })).json();
    expect(all.total).toBe(2);
  });

  test("another business can't see or touch these orders", async ({ request }) => {
    const { o, supplierId, rice } = await setup(request);
    const po = (await (await request.post("/api/purchase-orders", { headers: o.headers, data: { supplierId, lines: [{ productId: rice, qty: 1, unitCost: 1 }] } })).json()).order;
    const other = await newOwner(request, "other");
    expect((await request.get(`/api/purchase-orders/${po.id}`, { headers: other.headers })).status()).toBe(404);
    expect((await request.post(`/api/purchase-orders/${po.id}/send`, { headers: other.headers })).status()).toBe(404);
    // …nor can they order someone else's product.
    const theirs = await request.post("/api/purchase-orders", { headers: other.headers, data: { lines: [{ productId: rice, qty: 1, unitCost: 1 }] } });
    expect(theirs.status()).toBe(400);
  });

  test("is a Pro feature (on the trial, paused after)", async ({ request }) => {
    const o = await newOwner(request);
    await setTrialEnd(o.accountId, -1);
    const r = await request.get("/api/purchase-orders", { headers: o.headers });
    expect(r.status()).toBe(403);
    expect((await r.json()).error).toBe("plan_required");
  });
});

void sell;
