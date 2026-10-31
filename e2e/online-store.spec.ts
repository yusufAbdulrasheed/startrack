import { expect, test, type Page } from "@playwright/test";
import { ADDRESS, CUSTOMER, OWNER, SLUG } from "./support/env";
import { business, closeDb, customerByEmail, onlineSales, ordersByStatus, setAcceptingOrders, setStock, stockOf } from "./support/db";

/**
 * The online store, end to end, as two people see it: a customer on their phone
 * (scanned the QR code, registers, shops, orders) and the owner at their desk
 * (gets the order, confirms it, finds the sale and the customer in their books).
 *
 * The tests tell one story in order against one shared store, so they run
 * serially. Every number is derived from the seed data in support/env.ts:
 *   2 × Premium Rice (5,200) + 1 × Fresh Eggs (3,800) = 14,200 + 500 delivery = 14,700
 */
test.describe.configure({ mode: "serial" });
test.afterAll(closeDb);

const STORE = `/s/${SLUG}`;

// The customer's session, captured at registration and reused: signing in through
// the form in every test would (rightly) trip the app's brute-force limit of
// 8 sign-ins per email per 15 minutes. The sign-in form has its own test.
let customerToken = "";
async function asCustomer(page: Page) {
  expect(customerToken, "registration must run first").not.toBe("");
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [`startrack.shopper.${SLUG}`, customerToken]);
}
const basketButton = (page: Page) => page.getByRole("button", { name: /^Basket/ });
const productCard = (page: Page, name: string) => page.locator("ul > li").filter({ has: page.getByRole("heading", { name, level: 3 }) });
const alertText = (page: Page) => page.getByRole("alert");

async function register(page: Page) {
  await page.getByLabel("Your name").fill(CUSTOMER.name);
  await page.getByLabel("Phone number").fill(CUSTOMER.phone);
  await page.getByLabel("Email").fill(CUSTOMER.email);
  await page.locator('input[autocomplete="new-password"]').fill(CUSTOMER.password);
  await page.getByRole("button", { name: "Create account & continue" }).click();
}

async function signInCustomer(page: Page, password = CUSTOMER.password) {
  await page.getByRole("tab", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(CUSTOMER.email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function ownerSignIn(page: Page) {
  // Skip the first-run product tour; it's covered by its own feature, not this one.
  await page.addInitScript(() => localStorage.setItem("startrack.tour.dashboard-v1", "1"));
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(OWNER.email);
  await page.getByPlaceholder("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
}

// ════════════════════════════════════════════════════════════════════════════
test.describe("Customer, on their phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("scanning the QR code lands on a sign-up wall — the shop itself is locked", async ({ page, request }) => {
    // The server refuses the shop to a stranger; hiding buttons isn't the protection.
    for (const path of ["catalog", "orders", "site"]) {
      expect((await request.get(`/api/public/store/${SLUG}/${path}`)).status(), `${path} must need a sign-in`).toBe(401);
    }

    await page.goto(`${STORE}?src=qr`);
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByText("Fresh groceries, delivered").first()).toBeVisible();
    await expect(page.getByText("Free delivery on orders over")).toBeVisible();
    await expect(page.getByText("Premium Rice 5kg")).toHaveCount(0);
    await expect(page.getByText("₦5,200")).toHaveCount(0);

    // …and the owner's scan counter moved.
    const b = await business();
    expect(b.site.visits).toBeGreaterThanOrEqual(1);
    expect(b.site.qrScans).toBeGreaterThanOrEqual(1);
  });

  test("registration checks what's typed before letting anyone in", async ({ page }) => {
    await page.goto(STORE);
    await page.getByLabel("Your name").fill("Chidi Okafor");
    await page.getByLabel("Phone number").fill("abc");
    await page.getByLabel("Email").fill(CUSTOMER.email);
    await page.locator('input[autocomplete="new-password"]').fill(CUSTOMER.password);
    await page.getByRole("button", { name: "Create account & continue" }).click();
    await expect(alertText(page)).toContainText("valid phone number");

    await page.getByLabel("Phone number").fill(CUSTOMER.phone);
    await page.locator('input[autocomplete="new-password"]').fill("short");
    await page.getByRole("button", { name: "Create account & continue" }).click();
    await expect(alertText(page)).toContainText("at least 8 characters");
    await expect(basketButton(page)).toHaveCount(0);
  });

  test("a customer registers, is let in, and appears in the owner's customer book", async ({ page }) => {
    await page.goto(STORE);
    await register(page);

    await expect(basketButton(page)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fresh groceries, delivered" })).toBeVisible();
    customerToken = (await page.evaluate((k) => localStorage.getItem(k), `startrack.shopper.${SLUG}`)) || "";

    const customer = await customerByEmail(CUSTOMER.email);
    expect(customer, "the shopper must exist in the owner's customers").toBeTruthy();
    expect(customer!.source).toBe("website");
    expect(customer!.name).toBe(CUSTOMER.name);
    expect(customer!.phone).toBe("08035551234");
  });

  test("the session survives a reload; sign out locks the page again; sign in lets them back", async ({ page }) => {
    await page.goto(STORE);
    // Each test gets a fresh browser, so there's no session yet — sign in as the customer from the last test.
    await signInCustomer(page);
    await expect(basketButton(page)).toBeVisible();

    await page.reload();
    await expect(basketButton(page)).toBeVisible();

    await page.goto(`${STORE}#account`);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await expect(page.getByText(CUSTOMER.email, { exact: false }).first()).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(basketButton(page)).toHaveCount(0);

    await signInCustomer(page, "not-the-password");
    await expect(alertText(page)).toContainText("don't match");

    await signInCustomer(page);
    await expect(basketButton(page)).toBeVisible();
  });

  test("the shop shows what's for sale, flags sold-out and nearly-gone items, and searches", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#shop`);
    await expect(page.getByRole("heading", { name: "Shop", level: 1 })).toBeVisible();

    await expect(productCard(page, "Premium Rice 5kg")).toBeVisible();
    await expect(productCard(page, "Premium Rice 5kg")).toContainText("₦5,200");

    const butter = productCard(page, "Butter 250g");
    await expect(butter).toContainText("Sold out");
    await expect(butter.getByRole("button", { name: "Unavailable" })).toBeDisabled();

    await expect(productCard(page, "Vegetable Oil 1L")).toContainText("Only 3 left");

    await page.getByPlaceholder("Search products…").fill("rice");
    await expect(productCard(page, "Premium Rice 5kg")).toBeVisible();
    await expect(productCard(page, "Spaghetti 500g")).toHaveCount(0);
    await page.getByPlaceholder("Search products…").fill("zzzz-nothing");
    await expect(page.getByText("Nothing matches that")).toBeVisible();
  });

  test("items go into the basket, quantities change, and the basket survives navigation", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#shop`);

    const rice = productCard(page, "Premium Rice 5kg");
    await rice.getByRole("button", { name: "Add to basket" }).click();
    await expect(rice.locator("[aria-live=polite]")).toHaveText("1");
    await rice.getByRole("button", { name: "Increase quantity" }).click();
    await expect(rice.locator("[aria-live=polite]")).toHaveText("2");
    await expect(page.getByText("2 items in your basket")).toBeVisible();

    await productCard(page, "Fresh Eggs (crate)").getByRole("button", { name: "Add to basket" }).click();
    await expect(page.getByText("3 items in your basket")).toBeVisible();
    await expect(page.getByText("₦14,200").first()).toBeVisible();

    await page.reload();
    await expect(page.getByText("3 items in your basket")).toBeVisible();
  });

  test("checkout for delivery: needs an address, offers pay-on-delivery, prices on the server, and places the order", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    // A new browser starts with an empty basket: 2 × Rice + 1 × Eggs.
    await page.goto(`${STORE}#shop`);
    const rice = productCard(page, "Premium Rice 5kg");
    await rice.getByRole("button", { name: "Add to basket" }).click();
    await rice.getByRole("button", { name: "Increase quantity" }).click();
    await productCard(page, "Fresh Eggs (crate)").getByRole("button", { name: "Add to basket" }).click();
    await page.getByRole("button", { name: "Checkout", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

    await page.getByRole("button", { name: /^Delivery/ }).click();
    const place = page.getByRole("button", { name: /^Place order/ });
    await expect(place).toBeDisabled(); // no address yet
    await page.getByLabel("Delivery address").fill(ADDRESS);

    // The right ways to pay for delivery — and not the ones that make no sense.
    await expect(page.getByRole("button", { name: /^Pay on delivery/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: /^Bank transfer/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay at pickup/ })).toHaveCount(0);

    // The totals come from the server.
    await expect(page.getByText("₦14,200").first()).toBeVisible();
    await expect(page.getByText("₦500").first()).toBeVisible();
    await expect(place).toContainText("₦14,700");
    await expect(place).toBeEnabled();
    await place.click();

    await expect(page.getByRole("heading", { name: /^WEB-\d{4}$/ })).toBeVisible();
    await expect(page.getByText("Waiting for the shop")).toBeVisible();
    await expect(page.getByText("Thanks! The shop will confirm your order shortly")).toBeVisible();
    await expect(page.getByText("Pay on delivery · Not paid yet")).toBeVisible();
    await expect(page.getByText(ADDRESS)).toBeVisible();

    // Placing an order is a request: stock is untouched until the owner confirms.
    expect(await ordersByStatus("placed")).toBe(1);
    expect(await stockOf("Premium Rice 5kg")).toBe(40);
    await expect(basketButton(page)).toBeVisible();
    await page.goto(`${STORE}#shop`);
    await expect(page.getByText("in your basket")).toHaveCount(0); // the basket was emptied
  });

  test("an order the shop hasn't handled yet can be cancelled by the customer", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#shop`);
    await productCard(page, "Whole Milk 1L").getByRole("button", { name: "Add to basket" }).click();
    await page.getByRole("button", { name: "Checkout", exact: true }).click();

    // Pickup is the default, and it pays at pickup.
    await expect(page.getByRole("button", { name: /^Pay at pickup/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Place order/ }).click();
    await expect(page.getByRole("heading", { name: /^WEB-\d{4}$/ })).toBeVisible();

    await page.getByRole("button", { name: "Cancel order" }).click();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    expect(await ordersByStatus("cancelled")).toBe(1);

    await page.getByRole("button", { name: "All orders" }).click();
    await expect(page.getByText("WEB-0001")).toBeVisible();
    await expect(page.getByText("WEB-0002")).toBeVisible();
  });

  test("stock running out while someone shops is caught at checkout, and fixed in one tap", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#shop`);

    const oil = productCard(page, "Vegetable Oil 1L");
    await oil.getByRole("button", { name: "Add to basket" }).click();
    await oil.getByRole("button", { name: "Increase quantity" }).click();
    await oil.getByRole("button", { name: "Increase quantity" }).click();
    await expect(oil.locator("[aria-live=polite]")).toHaveText("3");

    await setStock("Vegetable Oil 1L", 1); // someone else bought it meanwhile

    await page.goto(`${STORE}#checkout`);
    await expect(alertText(page)).toContainText("Only 1 of Vegetable Oil 1L left");
    await expect(page.getByRole("button", { name: /^Place order/ })).toBeDisabled();

    await page.getByRole("button", { name: "Update my basket" }).click();
    await expect(page.getByText("1 × ₦2,300")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Place order/ })).toBeEnabled();

    await setStock("Vegetable Oil 1L", 0); // …and now it's gone entirely
    await page.reload();
    await page.goto(`${STORE}#shop`);
    await expect(productCard(page, "Vegetable Oil 1L")).toContainText("Sold out");
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("Owner, at their desk", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("signing in shows the order waiting, in the dashboard banner and the notification bell", async ({ page }) => {
    await ownerSignIn(page);
    // Only the delivery order is still waiting — the other one was cancelled.
    await expect(page.getByText("1 online order waiting for you")).toBeVisible();

    await page.getByTitle(/open alert/).click();
    await expect(page.getByText(/New online order WEB-0001/)).toBeVisible();
  });

  test("the order is on the Online orders page with everything needed to act on it", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/orders");
    await expect(page.getByRole("heading", { name: "Online orders" })).toBeVisible();
    await expect(page.getByText("Waiting for you")).toBeVisible();

    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await expect(page.getByText(CUSTOMER.name).first()).toBeVisible();
    await expect(page.getByText(CUSTOMER.email)).toBeVisible();
    await expect(page.getByText(ADDRESS)).toBeVisible();
    await expect(page.getByText(/Premium Rice 5kg × 2/)).toBeVisible(); // the line in the dialog, not the list row behind it
    await expect(page.getByText("₦14,700").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm & record sale" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Decline" })).toBeVisible();
  });

  test("declining needs a reason (and the dialog can be backed out of)", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/orders");
    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("button", { name: "Decline order" })).toBeDisabled();
    await page.getByPlaceholder("e.g. Sorry, that item just ran out").fill("ok");
    await expect(page.getByRole("button", { name: "Decline order" })).toBeDisabled(); // still too short
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("button", { name: "Confirm & record sale" })).toBeVisible();
    expect(await ordersByStatus("placed")).toBe(1); // nothing was declined
  });

  test("confirming records the sale and takes the stock off", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/orders");
    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await page.getByRole("button", { name: "Confirm & record sale" }).click();

    await expect(page.getByRole("link", { name: /Sale R-\d+/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm & record sale" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Out for delivery" })).toBeVisible();

    const sales = await onlineSales();
    expect(sales).toHaveLength(1);
    expect(sales[0].total).toBe(14700);
    expect(sales[0].deliveryFee).toBe(500);
    expect(sales[0].orderNo).toBe("WEB-0001");
    expect(await stockOf("Premium Rice 5kg")).toBe(38);
    expect(await stockOf("Fresh Eggs (crate)")).toBe(14);

    // The "new order" alert closes once someone has dealt with it.
    await page.goto("/app/dashboard");
    await expect(page.getByText(/online order.* waiting for you/)).toHaveCount(0);
  });

  test("the order moves through delivery to completed, and cash on delivery is marked paid", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/orders");
    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await page.getByRole("button", { name: "Out for delivery" }).click();
    await expect(page.getByText("Out for delivery").first()).toBeVisible();
    await page.getByRole("button", { name: "Delivered" }).click();
    await expect(page.getByText("Pay on delivery · paid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delivered" })).toHaveCount(0);
  });

  test("the web customer is in the customer book, marked 'website', with their spend", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/customers");
    const row = page.getByRole("button", { name: new RegExp(CUSTOMER.name) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("website");
    await expect(row).toContainText("₦14,700");

    await row.click();
    await expect(page.getByText("signed up on your website")).toBeVisible();
    await expect(page.getByText(CUSTOMER.email)).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Website sign-ups only" }).click();
    await expect(page.getByRole("button", { name: new RegExp(CUSTOMER.name) })).toBeVisible();
  });

  test("the sale is in Sales, tagged online, and the channel filter tells it apart from till sales", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/sales");
    const webSale = page.getByRole("row").filter({ hasText: "online" });
    await expect(webSale).toHaveCount(1);
    await expect(webSale).toContainText("₦14,700");

    await page.getByLabel("Where the sale was made").selectOption("pos");
    await expect(page.getByRole("row").filter({ hasText: "online" })).toHaveCount(0);
    await page.getByLabel("Where the sale was made").selectOption("online");
    await expect(page.getByRole("row").filter({ hasText: "online" })).toHaveCount(1);
  });

  test("the Online store settings offer a share kit and the pickup, delivery and payment options", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/my-site");
    await page.getByRole("button", { name: "Online store" }).click();

    await expect(page.getByText("Store is on")).toBeVisible();
    await expect(page.getByText("Share with customers")).toBeVisible();
    await expect(page.getByRole("img", { name: "QR code for your online store" })).toBeVisible();
    await expect(page.getByText(`/s/${SLUG}`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Print poster" })).toBeVisible();
    await expect(page.getByText("QR scans")).toBeVisible();
    await expect(page.getByText("Pickup & delivery")).toBeVisible();
    await expect(page.getByText("Bank transfer").first()).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("Customer, checking back", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the customer sees the shop worked on their order", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#orders`);
    await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Delivered")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0); // too late to cancel
    await expect(page.getByRole("button", { name: "Order again" })).toBeVisible();
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("Owner voids the sale", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("voiding the web sale cancels the order and returns the stock", async ({ page }) => {
    await ownerSignIn(page);
    await page.goto("/app/sales");
    await page.getByRole("row").filter({ hasText: "online" }).click();
    await page.getByRole("button", { name: "Void this sale" }).click();
    await page.getByPlaceholder("Why is this sale being voided?").fill("Customer refused the delivery");
    await page.getByRole("button", { name: "Void this sale" }).click();
    await expect(page.getByRole("row").filter({ hasText: "voided" })).toHaveCount(1);

    expect(await stockOf("Premium Rice 5kg")).toBe(40);
    expect(await stockOf("Fresh Eggs (crate)")).toBe(15);

    await page.goto("/app/orders");
    await page.getByRole("button", { name: "Closed" }).click();
    await expect(page.getByRole("button", { name: /WEB-0001/ })).toContainText("Cancelled");
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("Customer, last look", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the customer sees the cancellation, and a paused shop stops taking orders", async ({ page }) => {
    await asCustomer(page);
    await page.goto(STORE);
    await page.goto(`${STORE}#orders`);
    await page.getByRole("button", { name: /WEB-0001/ }).click();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible();

    await setAcceptingOrders(false); // the owner pauses the shop
    await page.goto(STORE);
    await page.goto(`${STORE}#shop`);
    await page.reload();
    await expect(page.getByText("isn't taking new orders right now")).toBeVisible();
    await expect(productCard(page, "Premium Rice 5kg").getByRole("button", { name: "Add to basket" })).toBeDisabled();
    await setAcceptingOrders(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
test.describe("Security", () => {
  test("repeated wrong sign-ins are locked out, and the response never reveals who has an account", async ({ request }) => {
    const url = `/api/public/store/${SLUG}/auth/login`;
    const attempt = (email: string) => request.post(url, { data: { email, password: "wrong-password" } });

    const unknown = await attempt("nobody@example.test");
    const known = await attempt(CUSTOMER.email);
    expect(unknown.status()).toBe(401);
    expect(known.status()).toBe(401);
    expect((await unknown.json()).message).toBe((await known.json()).message); // same answer either way

    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await attempt("brute-force@example.test")).status());
    expect(statuses.slice(0, 8), "the first 8 tries get an ordinary 'wrong password'").toEqual(Array(8).fill(401));
    expect(statuses[8], "the 9th rapid try on one email is refused").toBe(429);
  });
});
