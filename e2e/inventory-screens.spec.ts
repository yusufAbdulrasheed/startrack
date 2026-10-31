import { expect, test, type Page } from "@playwright/test";
import { closeDb, customerCount, fillCustomers, metricFor, salesCount, seedProduct, setTrialEnd, stockLevel } from "./support/db";
import { newOwner, type Owner } from "./support/owner";

/**
 * The new screens, in a real browser: the Inventory page (stock, value, what's
 * selling, reorder, purchase orders, opening-stock upload), uploading customers
 * from the Customers page, and uploading past sales.
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

const file = (name: string, csv: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });

test.describe("Inventory page", () => {
  test("shows the shelf with statuses, totals and a working quick adjust", async ({ page, request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 50, { cost: 700, reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Beans", 800, 4, { cost: 500, reorderLevel: 10, category: "Grains" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Salt", 200, 0, { cost: 100, reorderLevel: 5, category: "Cooking" });
    await signIn(page, o);

    await page.goto("/app/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    // Neediest first: out, low, then fine.
    const names = page.locator("tbody tr td:first-child .font-semibold");
    await expect(names).toHaveText(["Salt", "Beans", "Rice"]);
    await expect(page.getByRole("row", { name: /Salt/ })).toContainText("Out");
    await expect(page.getByRole("row", { name: /Beans/ })).toContainText("Low");
    await expect(page.getByText("₦37,000").first()).toBeVisible();   // stock value at cost
    await expect(page.getByText("Running low").locator("..")).toContainText("1");

    // The tiles are filters.
    await page.getByRole("button", { name: /Out of stock/ }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: /Out of stock/ }).click();

    // Quick adjust writes through the stock ledger.
    await page.getByRole("button", { name: "Adjust Rice" }).click();
    await page.getByLabel("What's really on the shelf now").fill("42");
    await expect(page.getByText("That removes 8")).toBeVisible();
    await page.getByRole("button", { name: "Save new count" }).click();
    await expect(page.getByRole("row", { name: /Rice/ })).toContainText("42");
    expect(await stockLevel(o.branchId, rice)).toBe(42);
  });

  test("the Value, What's selling and Reorder tabs tell the story of the shelf", async ({ page, request }) => {
    const o = await newOwner(request);
    const hot = await seedProduct(o.accountId, o.businessId, o.branchId, "Hot Item", 100, 6, { cost: 50, reorderLevel: 2, category: "Fast" });
    await seedProduct(o.accountId, o.businessId, o.branchId, "Dusty Item", 100, 30, { cost: 60, reorderLevel: 2, category: "Slow" });
    expect((await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId: hot, qty: 5 }], payments: [{ method: "cash", amount: 500 }] } })).status()).toBe(201);
    await signIn(page, o);
    await page.goto("/app/inventory");

    await page.getByRole("tab", { name: "Value" }).click();
    await expect(page.getByText("Stock at cost")).toBeVisible();
    await expect(page.getByText("Where the money sits")).toBeVisible();
    await expect(page.getByText("Biggest holdings")).toBeVisible();
    await expect(page.getByText("Dusty Item").first()).toBeVisible();

    await page.getByRole("tab", { name: "What's selling" }).click();
    await expect(page.getByText("Selling fast")).toBeVisible();
    await expect(page.getByText("5 sold").first()).toBeVisible();
    await expect(page.getByText("Not selling")).toBeVisible();
    await expect(page.getByText(/30 unit idle/).first()).toBeVisible();

    await page.getByRole("tab", { name: "Reorder" }).click();
    await expect(page.getByText("Hot Item").first()).toBeVisible();     // 1 left, selling fast
    await expect(page.getByText("Dusty Item")).toHaveCount(0);           // plenty of stock, not suggested
  });

  test("reorder → purchase order → send → receive books the goods in", async ({ page, request }) => {
    const o = await newOwner(request);
    const sup = await (await request.post("/api/suppliers", { headers: o.headers, data: { name: "Mama Put Foods", contact: "08033334444" } })).json();
    const supplierId = sup.supplier?.id || sup.id;
    const item = await seedProduct(o.accountId, o.businessId, o.branchId, "Low Item", 500, 1, { cost: 300, reorderLevel: 10 });
    await request.post("/api/inventory/stock-in", { headers: o.headers, data: { items: [{ productId: item, qty: 4, unitCost: 320 }], supplierId } });
    await signIn(page, o);
    await page.goto("/app/inventory");

    await page.getByRole("tab", { name: "Reorder" }).click();
    await expect(page.getByText("Mama Put Foods").first()).toBeVisible();   // last supplier is remembered
    await page.getByLabel("Quantity of Low Item").fill("20");
    await page.getByRole("button", { name: "Create purchase order" }).click();

    await expect(page.getByRole("tab", { name: "Purchase orders" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: /PO-0001/ }).click();
    await expect(page.getByText("Mama Put Foods").first()).toBeVisible();
    await page.getByRole("button", { name: "Mark as sent" }).click();
    await expect(page.getByText("Order sent. Share it with the supplier:")).toBeVisible();
    await expect(page.getByText("Low Item × 20")).toBeVisible();
    await expect(page.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me\/2348033334444/);

    await page.getByLabel("Receive Low Item").fill("12");
    await page.getByRole("button", { name: "Receive goods" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Part delivered")).toBeVisible();
    await expect.poll(() => stockLevel(o.branchId, item)).toBe(17); // 5 on hand + 12

    await page.getByLabel("Receive Low Item").fill("8");
    await page.getByRole("button", { name: "Receive goods" }).click();
    await expect(dialog.getByText("Received", { exact: true })).toBeVisible();
    await expect.poll(() => stockLevel(o.branchId, item)).toBe(25);
  });

  test("uploading opening stock: pick a file, check the preview, save", async ({ page, request }) => {
    const o = await newOwner(request);
    const rice = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 10, { cost: 700 });
    await signIn(page, o);
    await page.goto("/app/inventory");

    await page.getByRole("button", { name: "Import stock" }).click();
    await page.getByLabel("Choose a spreadsheet").setInputFiles(file("stock.csv", "Product,Qty,Cost\nRice,40,650\nNew Thing,5,100\n"));
    await expect(page.getByText("2 rows read")).toBeVisible();
    await expect(page.getByText("Stock will change").locator("..")).toContainText("1");
    await expect(page.getByText("Not in catalog").locator("..")).toContainText("1");

    // Turn on "add what's missing" and the unknown row now needs a price, so it stays out.
    await page.getByLabel(/Add products that aren't in my catalog/).check();
    await page.getByText(/Rows that need a look/).click();
    await expect(page.getByText("has no price to create it with")).toBeVisible();

    await page.getByRole("button", { name: /^Update 1 product/ }).click();
    await expect(page.getByText(/1 updated/)).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    expect(await stockLevel(o.branchId, rice)).toBe(40);
  });

  test("a role without the Pro features sees an upgrade prompt, not a broken page", async ({ page, request }) => {
    const o = await newOwner(request);
    await setTrialEnd(o.accountId, -1); // trial over: Freemium
    await signIn(page, o);
    await page.goto("/app/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();    // the hub itself is free
    await page.getByRole("button", { name: "Import stock" }).click();
    await expect(page.getByText(/Bulk import is part of the Pro plan|Bulk imports/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "Purchase orders" }).click();
    await expect(page.getByText("Purchase orders are part of Pro")).toBeVisible();
  });
});

test.describe("Customers page", () => {
  test("shows the plan's customer limit and uploads a list with a preview", async ({ page, request }) => {
    const o = await newOwner(request);
    await signIn(page, o);
    await page.goto("/app/customers");
    await expect(page.getByText("0", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/of 2,000 customers on your plan/)).toBeVisible();

    await page.getByRole("button", { name: "Import" }).click();
    const csv = "Name,Phone Number,Email\nAda Obi,08031110001,ada@x.com\nBola Eze,08031110002,\nAda Again,08031110001,\nNo Number,12,\n";
    await page.getByLabel("Choose a spreadsheet").setInputFiles(file("people.csv", csv));
    await expect(page.getByText("Will be added").locator("..")).toContainText("2");
    await expect(page.getByText("Already in your book").locator("..")).toContainText("1");
    await page.getByText(/Rows that need a look/).click();
    await expect(page.getByText(/doesn't look like a phone number/)).toBeVisible();
    await page.getByRole("button", { name: "Add 2 customers" }).click();
    await expect(page.getByText("2 customers added to your book.")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    await expect(page.getByRole("button", { name: /Ada Obi/ })).toBeVisible();
    expect(await customerCount(o.businessId)).toBe(2);
  });

  test("at the limit the page says so, and an upload tells you how many didn't fit", async ({ page, request }) => {
    const o = await newOwner(request);
    await setTrialEnd(o.accountId, -1);              // Freemium: 100
    await fillCustomers(o.accountId, o.businessId, 100);
    await signIn(page, o);
    await page.goto("/app/customers");
    await expect(page.getByText(/You can't add more, but nobody is removed/)).toBeVisible();
    await page.getByRole("button", { name: "Import" }).click();
    // Freemium can't upload at all — it gets the upgrade prompt, not a half-working dialog.
    await expect(page.getByText(/Bulk imports?/).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.getByLabel("Name").fill("One too many");
    await page.getByRole("button", { name: /^Add customer$|Save/ }).last().click();
    await expect(page.getByRole("dialog", { name: "Add customer" }).getByText(/up to 100 customers/)).toBeVisible();
  });
});

test.describe("Import past sales", () => {
  const CSV = `Date,Receipt No,Item,Quantity,Unit Price,Customer,Phone,Payment Method
15/03/2025,R-1,Rice,2,5000,Ada Obi,08031110001,Cash
15/03/2025,R-1,Oil,1,2000,Ada Obi,08031110001,Cash
16/03/2025,R-2,Rice,1,5000,,,Transfer
`;

  test("upload, preview, save, see it in Sales history, and undo it", async ({ page, request }) => {
    const o = await newOwner(request);
    await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 5200, 40, { cost: 3900 });
    await signIn(page, o);

    await page.goto("/app/import-history");
    await expect(page.getByRole("heading", { name: "Import past sales" })).toBeVisible();
    await expect(page.getByText("Nothing uploaded yet.")).toBeVisible();

    await page.getByRole("button", { name: "Upload a file" }).click();
    await page.getByLabel("Choose a spreadsheet").setInputFiles(file("march-sales.csv", CSV));
    await expect(page.getByText("Sales found").locator("..")).toContainText("2");
    await expect(page.getByText("Revenue", { exact: true }).locator("..")).toContainText("₦17,000");
    await expect(page.getByText("15 Mar 2025 – 16 Mar 2025")).toBeVisible();
    expect(await salesCount(o.businessId, "import")).toBe(0); // the preview saved nothing

    await page.getByRole("button", { name: "Save 2 sales" }).click();
    await expect(page.getByText(/2 sales added to your history/)).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    expect(await salesCount(o.businessId, "import")).toBe(2);
    expect(await stockLevel(o.branchId, (await (await request.get("/api/inventory/overview", { headers: o.headers })).json()).items[0].id)).toBe(40);
    expect((await metricFor(o.businessId, "2025-03-15"))!.revenue).toBe(12000);

    await expect(page.getByText("march-sales.csv")).toBeVisible();
    await expect(page.getByText("in your books")).toBeVisible();

    // The sales page shows them, labelled.
    await page.goto("/app/sales");
    await page.getByLabel("Where the sale was made").selectOption("import");
    await page.locator('input[type="date"]').first().fill("2025-03-01");
    await page.locator('input[type="date"]').nth(1).fill("2025-03-31");
    await expect(page.getByRole("row", { name: /H-00001 imported/ })).toContainText("Ada Obi");
    await expect(page.getByRole("row", { name: /H-00002 imported/ })).toContainText("₦5,000");

    // Undo it.
    await page.goto("/app/import-history");
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Yes, undo it" }).click();
    await expect(page.getByText("undone")).toBeVisible();
    expect(await salesCount(o.businessId, "import")).toBe(0);
  });

  test("when the columns aren't recognised the person chooses them, instead of being stuck", async ({ page, request }) => {
    const o = await newOwner(request);
    await signIn(page, o);
    await page.goto("/app/import-history");
    await page.getByRole("button", { name: "Upload a file" }).click();
    await page.getByLabel("Choose a spreadsheet").setInputFiles(file("odd.csv", "When,What,How many,Naira\n05-03-2025,Rice,2,10000\n06-03-2025,Rice,1,5000\n"));
    // "When"/"What" aren't names we know, so the dialog asks.
    await expect(page.getByText(/I need columns for the date/)).toBeVisible();
    await page.getByLabel(/^Date/).selectOption("When");
    await page.getByLabel(/^Item sold/).selectOption("What");
    await page.getByLabel(/^Quantity/).selectOption("How many");
    await page.getByLabel(/^Line total/).selectOption("Naira");
    await expect(page.getByText("Sales found").locator("..")).toContainText("2");
    await expect(page.getByText("05 Mar 2025").or(page.getByText("5 Mar 2025")).first()).toBeVisible(); // read day-first
  });
});
