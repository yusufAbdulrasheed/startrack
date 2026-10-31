import { expect, test, type Page } from "@playwright/test";
// @ts-expect-error plain JS shared with the server
import { BUSINESS_TYPES } from "../server/shared/businessTypes.js";
import { closeDb, db, payFor, seedProduct } from "./support/db";
import { freshIp } from "./support/owner";

/**
 * Opens the real app in a real browser and visits EVERY screen each kind of
 * business can see, as the owner on the top plan. A screen passes when it loads
 * without a crash, an uncaught script error, a failed (5xx) API call or a blank page.
 * Every business type is covered, because each one has different screens.
 */
test.afterAll(closeDb);
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

// Always-present routes, plus whatever the sidebar of this business type offers.
const CORE = ["home", "dashboard", "pos", "sales", "products", "stock-in", "customers", "expenses", "staff", "inventory", "invoices", "orders", "my-site", "settings", "billing", "receipt", "import-history", "tickets", "businesses", "activity", "audit", "returns", "suppliers", "stock-count", "transfers", "attendance", "all-stores", "ask-ai"];

type Problems = string[];

function watch(page: Page): Problems {
  const problems: Problems = [];
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 500) problems.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return problems;
}

async function ownerOfType(request: any, typeKey: string) {
  const email = `smoke-${typeKey}-${Date.now().toString(36)}@example.test`;
  const res = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": freshIp() },
    data: { name: "Smoke Owner", email, phone: "08031112222", password: "OwnerPass123", businessName: `Smoke ${typeKey}`, businessType: typeKey, plan: "business" },
  });
  expect(res.status(), JSON.stringify(await res.json())).toBe(201);
  await (await db()).collection("users").updateOne({ email }, { $set: { emailVerified: true, phoneVerified: true } });
  const s = await res.json();
  expect((await payFor(s.account.id, "business")).ok).toBe(true);
  await seedProduct(s.account.id, s.businesses[0].id, s.branches[0].id, "Sample Item", 1500, 25, { cost: 900 });
  return email;
}

async function signIn(page: Page, email: string) {
  await page.addInitScript(() => localStorage.setItem("startrack.tour.dashboard-v1", "1"));
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByPlaceholder("Password").fill("OwnerPass123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/app\//);
}

for (const typeKey of Object.keys(BUSINESS_TYPES)) {
  test(`every screen opens cleanly: ${typeKey}`, async ({ page, request }) => {
    const email = await ownerOfType(request, typeKey);
    const problems = watch(page);
    await signIn(page, email);

    // What this business's own menu offers, plus the common screens.
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    const menu: string[] = await page.$$eval('a[href^="/app/"]', (as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!.replace(/^\/app\//, "").split(/[?#]/)[0]))]);
    const routes = [...new Set([...CORE, ...menu])].filter(Boolean);
    expect(routes.length).toBeGreaterThan(10);

    const broken: string[] = [];
    for (const r of routes) {
      const before = problems.length;
      await page.goto(`/app/${r}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      // Still inside the app (not bounced to login), with something drawn on the page.
      const url = page.url();
      if (/\/login/.test(url)) { broken.push(`${r}: sent back to sign-in`); continue; }
      const text = (await page.locator("body").innerText()).trim();
      if (text.length < 20) broken.push(`${r}: blank page`);
      if (/something went wrong|unexpected error|cannot read prop|is not defined/i.test(text)) broken.push(`${r}: error text on screen`);
      for (const p of problems.slice(before)) broken.push(`${r}: ${p}`);
    }
    expect(broken, `${routes.length} screens visited for ${typeKey}`).toEqual([]);
  });
}

test("the public pages open: landing, docs, login, register, business page, store, invoice and receipt links", async ({ page, request }) => {
  const problems = watch(page);
  for (const p of ["/", "/docs", "/login", "/register", "/s/fresh-mart"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect((await page.locator("body").innerText()).trim().length, p).toBeGreaterThan(30);
  }
  // A link nobody should have: a clean "not available" page, not a crash.
  for (const p of ["/i/" + "a".repeat(32), "/r/" + "a".repeat(48), "/loyalty/NOPE"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle").catch(() => {});
    expect((await page.locator("body").innerText()).trim().length, p).toBeGreaterThan(10);
  }
  // Signed-out visitors can't open the app or the platform console.
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login|\/$/);
  await page.goto("/admin/overview");
  await expect(page).not.toHaveURL(/\/admin\/overview$/);
  expect(problems).toEqual([]);
  expect(request).toBeTruthy();
});
