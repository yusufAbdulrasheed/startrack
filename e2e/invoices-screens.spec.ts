import { expect, test, type Page } from "@playwright/test";
import { closeDb, customerDoc, seedProduct, setTrialEnd, stockLevel } from "./support/db";
import { newOwner, type Owner } from "./support/owner";

/** The invoice screens in a real browser, from drafting one to the customer opening the link. */
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

test("draft → issue → part-pay → the customer opens the link → void", async ({ page, request, browser }) => {
  const o = await newOwner(request);
  const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
  await signIn(page, o);

  await page.goto("/app/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await expect(page.getByText("No invoices yet")).toBeVisible();

  // Draft it.
  await page.getByRole("button", { name: "New invoice" }).first().click();
  await page.getByLabel("Customer name").fill("Ada Obi");
  await page.getByLabel("Customer phone").fill("08031110001");
  await page.getByLabel("Add an item").fill("Ric");
  await page.getByRole("button", { name: /Rice/ }).click();
  await page.getByLabel("Quantity for Rice").fill("4");
  await page.getByLabel("Add an item").fill("Delivery");
  await page.getByRole("button", { name: /as a service/ }).click();
  await page.getByLabel("Price for Delivery").fill("500");
  await expect(page.getByTestId("editor-total")).toHaveText("₦4,500");
  await page.getByRole("button", { name: "Save draft" }).click();

  // Nothing has moved yet.
  await expect(page.getByRole("button", { name: "Issue invoice" })).toBeVisible();
  expect(await stockLevel(o.branchId, rice)).toBe(20);

  // Issue it.
  await page.getByRole("button", { name: "Issue invoice" }).click();
  await expect(page.getByTestId("balance")).toContainText("₦4,500");
  await expect(page.getByText("INV-0001").first()).toBeVisible();
  expect(await stockLevel(o.branchId, rice)).toBe(16);
  expect((await customerDoc(o.businessId, "Ada Obi"))!.creditBalance).toBe(4500);

  // Share link → what the customer sees, in a fresh browser with no login.
  await page.getByRole("button", { name: "Copy link" }).click();
  const list = await (await request.get("/api/invoices", { headers: o.headers })).json();
  const url: string = (await (await request.get(`/api/invoices/${list.invoices[0].id}`, { headers: o.headers })).json()).invoice.shareUrl;
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 800 } })).newPage(); // a phone
  await guest.goto(new URL(url).pathname);
  await expect(guest.getByTestId("public-invoice-no")).toHaveText("INV-0001");
  await expect(guest.getByTestId("public-balance")).toHaveText("₦4,500");
  await expect(guest.getByText("Ada Obi")).toBeVisible();
  expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // no sideways scroll on a phone
  await guest.context().close();

  // A deposit comes in.
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Payment amount").fill("1500");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByTestId("balance")).toContainText("₦3,000");
  await expect(page.getByText("Part paid").first()).toBeVisible();
  expect((await customerDoc(o.businessId, "Ada Obi"))!.creditBalance).toBe(3000);

  // Too much is refused, with a reason.
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Payment amount").fill("99999");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/more than|exceeds|owed/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Void it: needs a reason, puts everything back.
  await page.getByRole("button", { name: /Void this invoice/ }).click();
  const confirm = page.getByRole("button", { name: "Void invoice" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Reason for voiding").fill("Customer cancelled");
  await confirm.click();
  await expect(page.getByText(/Voided.*Customer cancelled/)).toBeVisible();
  expect(await stockLevel(o.branchId, rice)).toBe(20);
  expect((await customerDoc(o.businessId, "Ada Obi"))!.creditBalance).toBe(0);
});

test("the sales history tags invoice sales and keeps them from being voided there", async ({ page, request }) => {
  const o = await newOwner(request);
  const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
  const d = await (await request.post("/api/invoices", { headers: o.headers, data: { customer: { name: "Bola", phone: "08031110002" }, items: [{ productId: rice, qty: 1 }] } })).json();
  await request.post(`/api/invoices/${d.invoice.id}/issue`, { headers: o.headers });
  await signIn(page, o);
  await page.goto("/app/sales");
  await expect(page.getByText("invoice", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("INV-0001").first()).toBeVisible();
  await page.goto("/app/customers");
  await expect(page.getByText(/owes ₦1,000/)).toBeVisible();
});

test("on Freemium the page is paused with an upgrade prompt, not a blank screen", async ({ page, request }) => {
  const o = await newOwner(request);
  await setTrialEnd(o.accountId, -1);
  await signIn(page, o);
  await page.goto("/app/invoices");
  await expect(page.getByText(/Pro/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "New invoice" })).toHaveCount(0);
});
