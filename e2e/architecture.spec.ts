import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";
// @ts-expect-error plain JS shared with the server
import { BUSINESS_TYPES } from "../server/shared/businessTypes.js";
import { closeDb, db, payFor } from "./support/db";
import { freshIp } from "./support/owner";

/**
 * The architecture: independent businesses on a shared platform.
 *
 * These tests prove the boundaries hold where it matters, over real HTTP:
 * a business's own routes answer only to that business, a business can only
 * sell the kinds of item its own service handles, and an account left over from
 * a retired business type keeps working as plain retail instead of breaking.
 * The import rules (who may import whom) are checked by
 * server/scripts/checkArchitecture.js, which runs first.
 */
test.afterAll(closeDb);

const root = path.resolve(import.meta.dirname, "..");
const stamp = Date.now().toString(36);
let n = 0;

async function ownerOf(request: APIRequestContext, businessType: string) {
  const email = `arch-${businessType}-${++n}-${stamp}@example.test`;
  const res = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": freshIp() },
    data: { name: "Arch Owner", email, phone: "08031112222", password: "OwnerPass123", businessName: `Arch ${businessType}`, businessType, plan: "business" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const s = await res.json();
  await (await db()).collection("users").updateOne({ email }, { $set: { emailVerified: true, phoneVerified: true } });
  expect((await payFor(s.account.id, "business")).ok).toBe(true);
  const ids = { accountId: s.account.id as string, businessId: s.businesses[0].id as string, branchId: s.branches[0].id as string };
  return { ...ids, headers: { Authorization: `Bearer ${s.token}`, "x-business-id": ids.businessId, "x-branch-id": ids.branchId } as Record<string, string> };
}

test("the import rules hold: businesses import only themselves and the platform interface, the platform imports no business", () => {
  const r = spawnSync("node", ["server/scripts/checkArchitecture.js"], { cwd: root, encoding: "utf8" });
  expect(r.stdout + r.stderr, "run `npm run check:architecture` to see the problem").toContain("Architecture check passed");
  expect(r.status).toBe(0);
});

test("exactly the six businesses are installed", () => {
  expect(Object.keys(BUSINESS_TYPES).sort()).toEqual(["academy", "blinds", "electronics", "poultry", "supermarket", "water"]);
});

test("a retired business type can no longer be chosen", async ({ request }) => {
  for (const gone of ["restaurant", "hotel", "coldroom", "laundry", "gym", "salon", "agency"]) {
    const res = await request.post("/api/auth/register", {
      headers: { "x-forwarded-for": freshIp() },
      data: { name: "X", email: `gone-${gone}-${stamp}@example.test`, password: "OwnerPass123", businessName: "Gone", businessType: gone, plan: "free" },
    });
    expect(res.status(), gone).toBe(400);
  }
});

test.describe("each business's routes answer only to that business", () => {
  // The routes each business registers, with a type that is NOT that business.
  const ROUTES: [string, string, string][] = [
    ["/api/serials", "electronics", "supermarket"],
    ["/api/cohorts", "poultry", "water"],
    ["/api/vaccinations", "poultry", "academy"],
    ["/api/production/runs", "water", "poultry"],
    ["/api/loyalty/schedule", "water", "electronics"],
    ["/api/academy/courses", "academy", "blinds"],
  ];
  for (const [url, owner, stranger] of ROUTES) {
    test(`${url}: open to ${owner}, closed to ${stranger}`, async ({ request }) => {
      const mine = await ownerOf(request, owner);
      const theirs = await ownerOf(request, stranger);
      const refused = await request.get(url, { headers: theirs.headers });
      expect(refused.status()).toBe(404);
      expect((await refused.json()).error).toBe("not_available");
      // The owning business is let through the gate (whatever the screen then answers).
      const allowed = await request.get(url, { headers: mine.headers });
      expect((await allowed.json().catch(() => ({}))).error).not.toBe("not_available");
    });
  }
});

test("a business can only sell the kinds of item its own service handles", async ({ request }) => {
  const shop = await ownerOf(request, "supermarket");
  const blinds = await ownerOf(request, "blinds");
  const school = await ownerOf(request, "academy");
  const product = (extra: object) => ({ name: `Thing ${Math.random().toString(36).slice(2, 7)}`, category: "General", price: 1000, ...extra });

  // Made-to-order belongs to the blinds business; a service to the academy.
  expect((await request.post("/api/products", { headers: shop.headers, data: product({ archetype: "service" }) })).status()).toBe(400);
  expect((await request.post("/api/products", { headers: shop.headers, data: product({ archetype: "made_to_order", bom: [{ productId: "000000000000000000000000", per: "unit", factor: 1 }] }) })).status()).toBe(400);
  expect((await request.post("/api/products", { headers: blinds.headers, data: product({ archetype: "service" }) })).status()).toBe(400);
  expect((await request.post("/api/products", { headers: school.headers, data: product({ archetype: "service" }) })).status()).toBe(201);
  // Plain stock is sold by everyone.
  for (const o of [shop, blinds, school]) {
    expect((await request.post("/api/products", { headers: o.headers, data: product({}) })).status()).toBe(201);
  }
});

test("only the business that owns an optional module is offered it", async ({ request }) => {
  const modules = async (type: string) => {
    const o = await ownerOf(request, type);
    const r = await (await request.get("/api/settings", { headers: o.headers })).json();
    return r.availableModules.map((m: { key: string }) => m.key);
  };
  expect(await modules("blinds")).toContain("made_to_order");
  expect(await modules("supermarket")).not.toContain("made_to_order");
  expect(await modules("electronics")).not.toContain("made_to_order");
});

test("an account left over from a retired business type keeps working as plain retail", async ({ request }) => {
  const o = await ownerOf(request, "supermarket");
  // Simulate an account created before the type was retired.
  await (await db()).collection("businesses").updateOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }, { $set: { typeKey: "restaurant" } });

  const settings = await request.get("/api/settings", { headers: o.headers });
  expect(settings.status()).toBe(200);
  expect((await settings.json()).business.typeLabel).toBe("General Business");

  const made = await request.post("/api/products", { headers: o.headers, data: { name: "Plain item", category: "General", price: 500, openingStock: 5 } });
  expect(made.status(), await made.text()).toBe(201);
  const id = (await made.json()).product.id;
  const sold = await request.post("/api/sales", {
    headers: o.headers,
    data: { items: [{ productId: id, qty: 2 }], payments: [{ method: "cash", amount: 1000 }], discount: 0, clientSaleId: `legacy-${stamp}` },
  });
  expect(sold.status(), await sold.text()).toBe(201);
  // ...and the business-specific routes of the types it is NOT are still closed to it.
  expect((await request.get("/api/cohorts", { headers: o.headers })).status()).toBe(404);
});
