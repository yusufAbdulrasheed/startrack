import { expect, test, type Page } from "@playwright/test";
import { closeDb, seedProduct } from "./support/db";
import { newOwner, type Owner } from "./support/owner";

/**
 * Three things that were half-working: sending a receipt on WhatsApp, QR labels
 * for products, and staying in the same business after adding a branch.
 */
test.afterAll(closeDb);
test.use({ viewport: { width: 1440, height: 900 } });

async function signIn(page: Page, o: Owner) {
  await page.addInitScript(() => localStorage.setItem("startrack.tour.dashboard-v1", "1"));
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(o.email);
  await page.getByPlaceholder("Password").fill("OwnerPass123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
}


/** Stand-in for WhatsApp: records where the browser was sent instead of really going there. */
async function captureWhatsApp(page: Page) {
  const urls: string[] = [];
  await page.context().route(/(^https?:\/\/(wa\.me|api\.whatsapp\.com)\/)/, (route) => { urls.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "ok" }); });
  return urls;
}

async function sell(request: any, o: Owner, productId: string, extra: Record<string, unknown> = {}) {
  const r = await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty: 2 }], payments: [{ method: "cash", amount: 2000 }], ...extra } });
  expect(r.status()).toBe(201);
  return r.json();
}

test.describe("WhatsApp receipts", () => {
  test("a sale comes back with a receipt link; the public link shows the receipt and nothing private", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const res = await sell(request, o, rice, { customer: { name: "Ada Obi", phone: "08031110001" } });
    expect(res.receiptUrl).toMatch(/\/r\/[a-f0-9]{48}$/);
    expect(res.receipt).toMatchObject({ total: 2000, customerName: "Ada Obi", customerPhone: "08031110001" });

    const token = res.receiptUrl.split("/r/")[1];
    const pub = await request.get(`/api/public/receipts/${token}`); // no auth headers
    expect(pub.status()).toBe(200);
    const body = await pub.json();
    expect(body.receipt).toMatchObject({ saleNo: res.sale.saleNo, total: 2000, items: [{ name: "Rice", qty: 2, lineNet: 2000 }] });
    expect(body.voided).toBe(false);
    const raw = JSON.stringify(body);
    for (const secret of ["customerPhone\":\"0", "08031110001", "lineCost", "accountId", "businessId"]) expect(raw, secret).not.toContain(secret);
  });

  test("links can't be forged, guessed or pointed at another sale", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const { receiptUrl } = await sell(request, o, rice);
    const token = receiptUrl.split("/r/")[1];
    const forged = token.slice(0, 24) + "0".repeat(24);          // right sale, made-up signature
    const other = "0".repeat(24) + token.slice(24);              // right signature, a different sale
    for (const t of [forged, other, "short", "../../etc/passwd", "G".repeat(48)]) {
      expect((await request.get(`/api/public/receipts/${t}`)).status(), t).toBe(404);
    }
  });

  test("any past sale can be sent: the message has the number, the total and the link", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const { sale, receiptUrl } = await sell(request, o, rice, { customer: { name: "Ada Obi", phone: "08031110001" } });

    // The customer's saved number is used...
    const saved = await (await request.get(`/api/sales/${sale.id}/receipt`, { headers: o.headers })).json();
    expect(saved.whatsappUrl).toContain("wa.me/2348031110001?text=");
    const text = decodeURIComponent(saved.whatsappUrl.split("text=")[1]);
    expect(text).toContain("Ada");
    expect(text).toContain(sale.saleNo);
    expect(text).toContain("₦2,000");
    expect(text).toContain(receiptUrl);

    // ...a number typed at the till wins; no number at all lets WhatsApp pick the contact.
    const typed = await (await request.get(`/api/sales/${sale.id}/receipt?phone=0803%20222%203333`, { headers: o.headers })).json();
    expect(typed.whatsappUrl).toContain("wa.me/2348032223333?text=");
    const walkIn = await sell(request, o, rice);
    const anon = await (await request.get(`/api/sales/${walkIn.sale.id}/receipt`, { headers: o.headers })).json();
    expect(anon.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  test("one business can't pull another's receipt", async ({ request }) => {
    const a = await newOwner(request);
    const b = await newOwner(request);
    const rice = await seedProduct(a.accountId, a.businessId, a.branchId, "Rice", 1000, 20, { cost: 700 });
    const { sale } = await sell(request, a, rice);
    expect((await request.get(`/api/sales/${sale.id}/receipt`, { headers: b.headers })).status()).toBe(404);
  });

  test("a voided sale's link says so", async ({ request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const { sale, receiptUrl } = await sell(request, o, rice);
    await request.post(`/api/sales/${sale.id}/void`, { headers: o.headers, data: { reason: "customer changed mind" } });
    expect((await (await request.get(`/api/public/receipts/${receiptUrl.split("/r/")[1]}`)).json()).voided).toBe(true);
  });

  test("in the browser: Sales History sends it, and the customer's page shows the receipt", async ({ page, request, browser }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const { sale, receiptUrl } = await sell(request, o, rice, { customer: { name: "Ada Obi", phone: "08031110001" } });
    const sent = await captureWhatsApp(page);
    await signIn(page, o);
    await page.goto("/app/sales");
    await page.getByText(sale.saleNo).first().click();
    await page.getByRole("button", { name: "WhatsApp receipt" }).click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain("wa.me/2348031110001?text=");
    expect(decodeURIComponent(sent[0])).toContain(receiptUrl);

    const phone = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage();
    await phone.goto(new URL(receiptUrl).pathname);
    await expect(phone.getByTestId("public-receipt")).toContainText("Rice");
    await expect(phone.getByTestId("public-receipt")).toContainText("₦2,000");
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await phone.goto("/r/" + "a".repeat(48));
    await expect(phone.getByText("Receipt not available")).toBeVisible();
    await phone.context().close();
  });

  test("at the till: after a sale the WhatsApp button asks for a number when there isn't one", async ({ page, request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    const sent = await captureWhatsApp(page);
    await signIn(page, o);
    await page.goto("/app/pos");
    await page.getByText("Rice").first().click();
    await page.getByRole("button", { name: /^(Charge|Pay|Complete)/i }).first().click();
    await expect(page.getByLabel("Customer's WhatsApp number")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Customer's WhatsApp number").fill("08035556666");
    await page.getByRole("button", { name: "WhatsApp receipt" }).click();
    await expect.poll(() => sent.length).toBeGreaterThan(0);
    expect(sent[0]).toContain("wa.me/2348035556666?text=");
  });
});

test.describe("Product QR codes", () => {
  test("labels can be printed as QR for every product, and the till finds the product from its code", async ({ page, request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 20, { cost: 500 });
    await signIn(page, o);
    await page.goto("/app/products");
    await page.getByRole("button", { name: /Labels/ }).click();
    await expect(page.getByText("Print product labels")).toBeVisible();
    await expect(page.getByLabel("Label type")).toHaveValue("qr");
    await page.getByRole("button", { name: "Select all" }).click();

    // The sheet opens in a new window: a QR (not a barcode) per product, each carrying the product's code.
    const [sheet] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: /Print 2 labels/ }).click()]);
    await sheet.waitForLoadState();
    await expect(sheet.locator(".bc-label svg.qr")).toHaveCount(2);
    const codes = await sheet.locator(".bc-code").allTextContents();
    expect(codes).toHaveLength(2);
    expect(codes).toContain(`ST:${rice}`);
    expect(codes.every((c) => /^ST:[a-f0-9]{24}$/.test(c))).toBe(true);
    await sheet.close();

    // Typing/scanning that code at the till puts the product in the basket.
    await page.goto("/app/pos");
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill(`ST:${rice}`);
    await search.press("Enter");
    await expect(page.getByText("Rice").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Scan a product/ })).toBeVisible();
  });
});

test.describe("Branches belong to their own business", () => {
  test("adding a branch to the second business keeps you in the second business", async ({ page, request }) => {
    const o = await newOwner(request, "o", "business"); // several businesses is a Business-plan feature
    const second = await request.post("/api/settings/businesses", { headers: o.headers, data: { name: "Second Shop", businessType: "supermarket", branchName: "Second Main", currency: "₦" } });
    expect(second.status(), JSON.stringify(await second.json().catch(() => ({})))).toBe(201);

    const main = page.getByRole("main");
    await signIn(page, o);
    await page.goto("/app/businesses");
    await page.getByText("Second Shop").first().click();
    await expect(page).toHaveURL(/\/app\/dashboard/);

    await page.goto("/app/settings");
    await page.getByRole("button", { name: /Branches/ }).first().click();
    await expect(main.getByText("Second Main", { exact: true })).toBeVisible();
    await expect(main.getByText("Main Branch", { exact: true })).toHaveCount(0); // the first shop's branch is not shown here

    await page.getByRole("button", { name: "Add a branch" }).click();
    await page.getByPlaceholder(/Retail/).fill("Second Annex");
    await page.getByRole("button", { name: "Add branch" }).click();

    // Still in the second business, with ITS branches only.
    await expect(main.getByText("Second Annex", { exact: true })).toBeVisible();
    await expect(main.getByText("Second Main", { exact: true })).toBeVisible();
    await expect(main.getByText(/Shop o-\d+/)).toHaveCount(0);
    // A hard reload (what several screens do) must not throw you back to the first business either.
    await page.reload();
    await page.getByRole("button", { name: /Branches/ }).first().click();
    await expect(main.getByText("Second Annex", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("startrack.active"))).toContain('"businessId"');
  });
});
