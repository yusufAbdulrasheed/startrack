import { expect, test, type APIRequestContext } from "@playwright/test";
import mongoose from "mongoose";
import { closeDb, db, payFor } from "./support/db";
import { freshIp } from "./support/owner";

/**
 * What each business does that no other business does, end to end through the
 * real API. These are the pieces that live in server/businesses/<key>/ and plug
 * into the shared checkout, stock ledger and registry through hooks, so they
 * are what a refactor of the platform is most likely to break:
 *
 *   blinds       made-to-order items, priced by size, consuming components
 *   electronics  serial numbers checked and booked at the till, warranty started
 *   water        loyalty tokens earned at the till; production runs
 *   poultry      living batches fed from stock
 */
test.afterAll(closeDb);

const stamp = Date.now().toString(36);
let n = 0;

async function ownerOf(request: APIRequestContext, businessType: string) {
  const email = `svc-${businessType}-${++n}-${stamp}@example.test`;
  const res = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": freshIp() },
    data: { name: "Svc Owner", email, phone: "08031112222", password: "OwnerPass123", businessName: `Svc ${businessType}`, businessType, plan: "business" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const s = await res.json();
  await (await db()).collection("users").updateOne({ email }, { $set: { emailVerified: true, phoneVerified: true } });
  expect((await payFor(s.account.id, "business")).ok).toBe(true);
  const ids = { accountId: s.account.id as string, businessId: s.businesses[0].id as string, branchId: s.branches[0].id as string };
  return { ...ids, headers: { Authorization: `Bearer ${s.token}`, "x-business-id": ids.businessId, "x-branch-id": ids.branchId } as Record<string, string> };
}
type Owner = Awaited<ReturnType<typeof ownerOf>>;

const addProduct = async (request: APIRequestContext, o: Owner, data: object) => {
  const r = await request.post("/api/products", { headers: o.headers, data });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).product as { id: string };
};
const stockOf = async (request: APIRequestContext, o: Owner, id: string) =>
  ((await (await request.get("/api/products", { headers: o.headers })).json()).products as { id: string; stock: number }[]).find((p) => p.id === id)!.stock;
const sell = (request: APIRequestContext, o: Owner, items: object[], amount: number, extra: object = {}) =>
  request.post("/api/sales", { headers: o.headers, data: { items, payments: [{ method: "cash", amount }], discount: 0, clientSaleId: `c-${stamp}-${++n}`, ...extra } });

test.describe("Blinds: made-to-order", () => {
  test("a blind is priced by size, consumes fabric by the recipe, and a void gives the fabric back", async ({ request }) => {
    const o = await ownerOf(request, "blinds");
    const fabric = await addProduct(request, o, { name: "Blackout fabric", category: "Fabrics", price: 6000, cost: 3200, openingStock: 100 });
    const blind = await addProduct(request, o, {
      name: "Roller blind", category: "Blinds", archetype: "made_to_order", price: 5000,
      bom: [{ productId: fabric.id, per: "sqm", factor: 1, includeLeakage: true }],
    });

    // 2m × 1.5m = 3 m²: priced 3 × 5,000, and 3 units of fabric come off the shelf.
    const sold = await sell(request, o, [{ productId: blind.id, qty: 1, width: 2, height: 1.5 }], 15000);
    expect(sold.status(), await sold.text()).toBe(201);
    const sale = (await sold.json()).sale;
    expect(sale.total).toBe(15000);
    expect(sale.items[0]).toMatchObject({ qty: 1, unitPrice: 15000 });
    expect(await stockOf(request, o, fabric.id)).toBe(97);

    const voided = await request.post(`/api/sales/${sale.id}/void`, { headers: o.headers, data: { reason: "Customer changed mind" } });
    expect(voided.status(), await voided.text()).toBe(200);
    expect(await stockOf(request, o, fabric.id)).toBe(100);
  });

  test("a sized item without its size is refused, and the cashier can override the price", async ({ request }) => {
    const o = await ownerOf(request, "blinds");
    const fabric = await addProduct(request, o, { name: "Sheer fabric", category: "Fabrics", price: 4000, cost: 2000, openingStock: 50 });
    const blind = await addProduct(request, o, {
      name: "Day & night blind", category: "Blinds", archetype: "made_to_order", price: 4000,
      bom: [{ productId: fabric.id, per: "sqm", factor: 1 }],
    });
    const noSize = await sell(request, o, [{ productId: blind.id, qty: 1 }], 4000);
    expect(noSize.status()).toBe(400);
    expect((await noSize.json()).message).toMatch(/width and height/i);
    expect(await stockOf(request, o, fabric.id)).toBe(50); // nothing moved

    const negotiated = await sell(request, o, [{ productId: blind.id, qty: 1, width: 1, height: 1, price: 3500 }], 3500);
    expect(negotiated.status(), await negotiated.text()).toBe(201);
    expect((await negotiated.json()).sale.total).toBe(3500);
  });
});

test.describe("Electronics: serial numbers", () => {
  test("units picked at the till are checked, marked sold to the buyer, and start their warranty", async ({ request }) => {
    const o = await ownerOf(request, "electronics");
    const phone = await addProduct(request, o, { name: "Phone X", category: "Phones", price: 100000, cost: 80000, openingStock: 3, tracksSerials: true, warrantyMonths: 12 });
    const reg = await request.post("/api/serials", { headers: o.headers, data: { productId: phone.id, serialNos: ["IMEI-1", "IMEI-2", "IMEI-3"] } });
    expect(reg.status(), await reg.text()).toBe(201);

    const sold = await sell(request, o, [{ productId: phone.id, qty: 2, serialNos: ["IMEI-1", "IMEI-2"] }], 200000, { customer: { name: "Ada Buyer", phone: "08031110000" } });
    expect(sold.status(), await sold.text()).toBe(201);

    const serials = await (await db()).collection("serials").find({ businessId: new mongoose.Types.ObjectId(o.businessId) }).toArray();
    const by = Object.fromEntries(serials.map((s: any) => [s.serialNo, s]));
    expect(by["IMEI-1"]).toMatchObject({ status: "sold", customerName: "Ada Buyer" });
    expect(by["IMEI-2"].status).toBe("sold");
    expect(by["IMEI-3"].status).toBe("in_stock");
    const months = (new Date(by["IMEI-1"].warrantyExpiresAt).getTime() - new Date(by["IMEI-1"].soldAt).getTime()) / (30 * 86_400_000);
    expect(months).toBeGreaterThan(11);
    expect(months).toBeLessThan(13);
    expect(await stockOf(request, o, phone.id)).toBe(1);
  });

  test("a serial number that isn't in stock, or the wrong count, refuses the sale before anything moves", async ({ request }) => {
    const o = await ownerOf(request, "electronics");
    const phone = await addProduct(request, o, { name: "Phone Y", category: "Phones", price: 90000, cost: 70000, openingStock: 3, tracksSerials: true });
    await request.post("/api/serials", { headers: o.headers, data: { productId: phone.id, serialNos: ["S-1", "S-2", "S-3"] } });

    const unknown = await sell(request, o, [{ productId: phone.id, qty: 1, serialNos: ["NOPE"] }], 90000);
    expect(unknown.status()).toBe(400);
    expect((await unknown.json()).message).toMatch(/isn't an available serial/i);
    const miscount = await sell(request, o, [{ productId: phone.id, qty: 2, serialNos: ["S-1"] }], 180000);
    expect(miscount.status()).toBe(400);
    expect((await miscount.json()).message).toMatch(/chose 1 serial number/i);
    expect(await stockOf(request, o, phone.id)).toBe(3); // nothing moved

    // Serial capture never blocks a sale: with none picked it sells as plain stock.
    const plain = await sell(request, o, [{ productId: phone.id, qty: 1 }], 90000);
    expect(plain.status(), await plain.text()).toBe(201);
  });
});

test.describe("Water: loyalty tokens and production", () => {
  test("only sachet and bag lines earn loyalty tokens for a customer", async ({ request }) => {
    const o = await ownerOf(request, "water");
    const sachet = await addProduct(request, o, { name: "Sachet water (bag)", category: "Sachets", price: 500, cost: 300, openingStock: 50 });
    const bottle = await addProduct(request, o, { name: "Bottled water", category: "Bottles", price: 200, cost: 120, openingStock: 50 });

    const buyer = { customer: { name: "Mama Tokens", phone: "08039990000" } };
    expect((await sell(request, o, [{ productId: sachet.id, qty: 3 }, { productId: bottle.id, qty: 5 }], 2500, buyer)).status()).toBe(201);
    const customer = async () => (await db()).collection("customers").findOne({ businessId: new mongoose.Types.ObjectId(o.businessId), name: "Mama Tokens" });
    expect((await customer())!.sachetBagQty).toBe(3);                       // the bottles earned nothing

    expect((await sell(request, o, [{ productId: sachet.id, qty: 2 }], 1000, buyer)).status()).toBe(201);
    expect((await customer())!.sachetBagQty).toBe(5);                       // and it keeps adding up
  });

  test("a production run consumes the raw material and credits the finished packs", async ({ request }) => {
    const o = await ownerOf(request, "water");
    const preform = await addProduct(request, o, { name: "Preform", category: "Raw Materials", price: 50, cost: 30, openingStock: 100 });
    const pack = await addProduct(request, o, {
      name: "Water pack of 12", category: "Bottles", price: 1500, cost: 900, openingStock: 0,
      bom: [{ productId: preform.id, per: "unit", factor: 1, includeLeakage: true }], producedUnitsPerStockUnit: 12,
    });
    const run = await request.post("/api/production/runs", { headers: o.headers, data: { productId: pack.id, producedUnits: 24, leakage: 0, note: "Morning run" } });
    expect(run.status(), await run.text()).toBe(201);
    expect(await stockOf(request, o, preform.id)).toBe(76);   // 24 preforms used
    expect(await stockOf(request, o, pack.id)).toBe(2);       // 24 units = 2 packs of 12
  });
});

test.describe("Poultry: living batches", () => {
  test("a batch is fed from ordinary stock and its mortality is tracked", async ({ request }) => {
    const o = await ownerOf(request, "poultry");
    const feed = await addProduct(request, o, { name: "Broiler starter", category: "Feed", price: 12000, cost: 9000, openingStock: 10, unit: "bag" });
    const made = await request.post("/api/cohorts", { headers: o.headers, data: { name: "Batch 1", species: "Broiler", initialCount: 100 } });
    expect(made.status(), await made.text()).toBe(201);
    const cohort = (await made.json()).cohort;

    const fed = await request.post(`/api/cohorts/${cohort.id}/feed`, { headers: o.headers, data: { productId: feed.id, qty: 3 } });
    expect(fed.status(), await fed.text()).toBe(201);
    expect(await stockOf(request, o, feed.id)).toBe(7);

    const died = await request.post(`/api/cohorts/${cohort.id}/mortality`, { headers: o.headers, data: { count: 5, note: "Heat" } });
    expect(died.status(), await died.text()).toBe(200);
    const list = (await (await request.get("/api/cohorts", { headers: o.headers })).json()).cohorts as { id: string; currentCount: number }[];
    expect(list.find((c) => c.id === cohort.id)!.currentCount).toBe(95);
  });
});
