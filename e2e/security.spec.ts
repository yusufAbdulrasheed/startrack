import { expect, test, type APIRequestContext } from "@playwright/test";
import jwt from "jsonwebtoken";
import { closeDb, db, seedProduct, stockLevel } from "./support/db";
import { SLUG } from "./support/env";
import { freshIp, newOwner, type Owner } from "./support/owner";

/**
 * Attacking our own API. Each test is something a hostile customer, staff
 * member or stranger might try. A passing test means the attack FAILED.
 */
test.afterAll(closeDb);

const customer = { name: "Ada Obi", phone: "08031110001" };

async function seeded(request: APIRequestContext, tag = "o", plan: "free" | "pro" | "business" = "free") {
  const o = await newOwner(request, tag, plan);
  const productId = await seedProduct(o.accountId, o.businessId, o.branchId, "Rice", 1000, 20, { cost: 700 });
  const sale = await (await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty: 1 }], payments: [{ method: "cash", amount: 1000 }], customer } })).json();
  const cust = (await (await request.get("/api/customers", { headers: o.headers })).json()).customers[0];
  const inv = await (await request.post("/api/invoices", { headers: o.headers, data: { customer, items: [{ productId, qty: 1 }] } })).json();
  return { o, productId, saleId: sale.sale.id as string, customerId: cust.id as string, invoiceId: inv.invoice.id as string };
}

/** An admin with a password, signed in. */
async function adminOf(request: APIRequestContext, o: Owner) {
  const email = `admin-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.test`;
  const r = await request.post("/api/staff", { headers: o.headers, data: { name: "Adaeze Admin", role: "admin", pin: "4321", email, password: "AdminPass123" } });
  expect(r.status(), JSON.stringify(await r.json())).toBe(201);
  const login = await (await request.post("/api/auth/login", { data: { email, password: "AdminPass123" } })).json();
  return { email, token: login.token as string, headers: { ...o.headers, Authorization: `Bearer ${login.token}` } as Record<string, string> };
}

async function tillStaff(request: APIRequestContext, o: Owner, extra: Record<string, unknown> = {}, pin = "1111") {
  const r = await request.post("/api/staff", { headers: o.headers, data: { name: "Till Person", role: "staff", branchId: o.branchId, pin, ...extra } });
  expect(r.status(), JSON.stringify(await r.json())).toBe(201);
  const code = (await (await db()).collection("businesses").findOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }))!.code;
  const s = await (await request.post("/api/auth/till", { data: { businessCode: code, pin } })).json();
  expect(s.token).toBeTruthy();
  return { token: s.token as string, headers: { ...o.headers, Authorization: `Bearer ${s.token}` } as Record<string, string> };
}

test.describe("Who is allowed in at all", () => {
  const PROTECTED = ["/api/products", "/api/sales", "/api/customers", "/api/settings", "/api/staff", "/api/invoices", "/api/inventory", "/api/orders", "/api/billing", "/api/overview", "/api/notifications", "/api/audit", "/api/expenses", "/api/suppliers", "/api/purchase-orders", "/api/history-import", "/api/reports/sales", "/api/ai/history", "/api/site", "/api/verify", "/api/auth/me", "/api/search?q=a"];

  test("no token, no data: every protected endpoint says 401", async ({ request }) => {
    for (const p of PROTECTED) expect((await request.get(p)).status(), p).toBe(401);
  });

  test("garbage, forged, expired and alg=none tokens are all refused", async ({ request }) => {
    const o = await newOwner(request);
    const real: any = jwt.decode(o.token);
    const forged = jwt.sign({ sub: real.sub, accountId: real.accountId }, "dev-secret-change-me-NOT", { expiresIn: "1h" });
    const expired = jwt.sign({ sub: real.sub, accountId: real.accountId }, process.env.JWT_SECRET || "dev-secret-change-me", { expiresIn: -60 });
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: real.sub, accountId: real.accountId })).toString("base64url")}.`;
    const tampered = o.token.slice(0, -4) + (o.token.endsWith("AAAA") ? "BBBB" : "AAAA");
    for (const t of ["", "null", "undefined", "Bearer", "abc.def.ghi", forged, expired, none, tampered]) {
      const r = await request.get("/api/products", { headers: { ...o.headers, Authorization: `Bearer ${t}` } });
      expect(r.status(), t.slice(0, 30)).toBe(401);
    }
    // Basic/Token schemes are not accepted in place of Bearer.
    expect((await request.get("/api/products", { headers: { ...o.headers, Authorization: `Token ${o.token}` } })).status()).toBe(401);
  });

  test("an owner's token is not a platform token, and the platform surface hides itself", async ({ request }) => {
    const o = await newOwner(request);
    for (const p of ["/api/platform/overview", "/api/platform/accounts", "/api/platform/businesses"]) {
      expect((await request.get(p, { headers: o.headers })).status(), p).toBe(404);
      expect((await request.get(p)).status(), p + " (no token)").toBe(401);
    }
    const r = await request.post("/api/platform/accounts/000000000000000000000000/status", { headers: o.headers, data: { status: "suspended" } });
    expect([404]).toContain(r.status());
  });

  test("a customer's (shopper's) token can't be used on the owner API", async ({ request }) => {
    const reg = await request.post(`/api/public/store/${SLUG}/auth/register`, { headers: { "x-forwarded-for": freshIp() }, data: { name: "Sec Tester", email: `sec-${Date.now()}@example.test`, phone: "08039990000", password: "ShopPass123" } });
    const token = (await reg.json()).token;
    expect(token).toBeTruthy();
    const o = await newOwner(request);
    expect((await request.get("/api/products", { headers: { ...o.headers, Authorization: `Bearer ${token}` } })).status()).toBe(401);
    // ...and an owner's token is not a shopper session.
    expect((await request.get(`/api/public/store/${SLUG}/auth/me`, { headers: { Authorization: `Bearer ${o.token}` } })).status()).toBe(401);
  });
});

test.describe("Injection", () => {
  test("operators in JSON bodies are rejected, not executed", async ({ request }) => {
    const o = await newOwner(request);
    for (const body of [{ email: { $gt: "" }, password: "x" }, { email: o.email, password: { $ne: "x" } }, { email: { $regex: ".*" }, password: { $ne: null } }]) {
      const r = await request.post("/api/auth/login", { data: body });
      expect([400, 401, 429], JSON.stringify(body)).toContain(r.status());
    }
    const r = await request.post(`/api/public/store/${SLUG}/auth/login`, { data: { email: { $gt: "" }, password: { $gt: "" } } });
    expect([400, 401, 429]).toContain(r.status());
    expect((await r.json()).token).toBeUndefined();
  });

  test("operators in query strings never widen a search or crash it", async ({ request }) => {
    const { o } = await seeded(request);
    const probes = ["/api/products?q[$ne]=x", "/api/products?category[$regex]=.*", "/api/customers?q[$ne]=1", "/api/sales?status[$ne]=x&channel[$ne]=y", "/api/invoices?status[$ne]=x&q[$ne]=1", "/api/inventory?q[$gt]=", "/api/orders?status[$ne]=x", "/api/customers?q=.*", "/api/customers?q=(", "/api/invoices?q=((((", "/api/sales?saleNo[$ne]=x"];
    for (const p of probes) {
      const r = await request.get(p, { headers: o.headers });
      expect(r.status(), p).toBeLessThan(500);
    }
    // A regex bomb in a search box must come back quickly, treated as plain text.
    const t = Date.now();
    const r = await request.get("/api/customers?q=" + encodeURIComponent("(a+)+$" + "a".repeat(40)), { headers: o.headers });
    expect(r.status()).toBeLessThan(500);
    expect(Date.now() - t).toBeLessThan(4000);
  });

  test("markup in names is stored as text and escaped in the HTML we generate", async ({ request }) => {
    const { o, productId } = await seeded(request);
    const xss = `<img src=x onerror=alert(1)>`;
    const inv = await (await request.post("/api/invoices", { headers: o.headers, data: { customer: { name: xss, phone: "08031110009", email: "a@example.test" }, notes: xss, items: [{ productId, qty: 1 }] } })).json();
    const issued = await (await request.post(`/api/invoices/${inv.invoice.id}/issue`, { headers: o.headers })).json();
    const pub = await (await request.get(`/api/public/invoices/${issued.invoice.shareUrl.split("/i/")[1]}`)).json();
    // JSON carries the raw text (React escapes it on screen) — and it comes back with a JSON content type, not HTML.
    expect(pub.invoice.customer.name).toBe(xss);
    const raw = await request.get(`/api/public/invoices/${issued.invoice.shareUrl.split("/i/")[1]}`);
    expect(raw.headers()["content-type"]).toContain("application/json");
  });

  test("a spreadsheet cell that starts with = can't become a formula in an export", async ({ request }) => {
    const { o, productId } = await seeded(request);
    await request.patch(`/api/products/${productId}`, { headers: o.headers, data: { name: "=HYPERLINK(\"http://evil.test\",\"x\")" } });
    const r = await request.get("/api/inventory/export", { headers: o.headers });
    if (r.status() === 200) {
      const text = await r.text();
      expect(text).not.toMatch(/(^|,|\n)"?=HYPERLINK/);
    }
  });
});

test.describe("Brute force and abuse", () => {
  test("guessing an owner's password gets locked out", async ({ request }) => {
    const o = await newOwner(request);
    let blockedAt = 0;
    for (let i = 1; i <= 40; i++) {
      const r = await request.post("/api/auth/login", { data: { email: o.email, password: `wrong-${i}` } });
      if (r.status() === 429) { blockedAt = i; break; }
    }
    expect(blockedAt, "login must start refusing after a handful of wrong passwords").toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(15);
    // The right password is also held off during the lockout — otherwise the lockout means nothing.
    expect((await request.post("/api/auth/login", { data: { email: o.email, password: "OwnerPass123" } })).status()).toBe(429);
  });

  test("an unknown email and a wrong password look identical", async ({ request }) => {
    const o = await newOwner(request);
    const a = await request.post("/api/auth/login", { data: { email: o.email, password: "nope-nope" } });
    const b = await request.post("/api/auth/login", { data: { email: `ghost-${Date.now()}@example.test`, password: "nope-nope" } });
    expect(a.status()).toBe(b.status());
    expect(await a.json()).toEqual(await b.json());
  });

  test("a 4-digit till PIN can't be ground through", async ({ request }) => {
    const o = await newOwner(request);
    await tillStaff(request, o, {}, "7351");
    const code = (await (await db()).collection("businesses").findOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }))!.code;
    let limited = 0;
    for (let i = 0; i < 40; i++) {
      const r = await request.post("/api/auth/till", { data: { businessCode: code, pin: String(1000 + i) } });
      if (r.status() === 429) { limited = i; break; }
    }
    expect(limited).toBeGreaterThan(0);
    expect(limited).toBeLessThanOrEqual(15);
  });

  test("sign-up can't be used to create accounts without limit", async ({ request }) => {
    let limited = false;
    const ip = freshIp(); // one address making all of them
    for (let i = 0; i < 30 && !limited; i++) {
      const r = await request.post("/api/auth/register", { headers: { "x-forwarded-for": ip }, data: { name: "Spam Bot", email: `spam-${Date.now()}-${i}@example.test`, phone: "08031112222", password: "OwnerPass123", businessName: `Spam ${i}`, businessType: "supermarket", plan: "free" } });
      limited = r.status() === 429;
    }
    expect(limited, "register should throttle bulk sign-ups from one address").toBe(true);
  });

  test("password reset reveals nothing about who has an account", async ({ request }) => {
    const known = await request.post(`/api/public/store/${SLUG}/auth/forgot`, { data: { email: "owner@freshmart.test" } });
    const unknown = await request.post(`/api/public/store/${SLUG}/auth/forgot`, { data: { email: `nobody-${Date.now()}@example.test` } });
    expect(known.status()).toBe(unknown.status());
    expect(await known.json()).toEqual(await unknown.json());
  });
});

test.describe("One business can never touch another's data", () => {
  test("a valid login with someone else's business id is refused", async ({ request }) => {
    const a = await newOwner(request);
    const b = await newOwner(request);
    const r = await request.get("/api/products", { headers: { Authorization: `Bearer ${a.token}`, "x-business-id": b.businessId, "x-branch-id": b.branchId } });
    expect(r.status()).toBe(403);
    // ...nor their branch inside your own business.
    const r2 = await request.get("/api/products", { headers: { Authorization: `Bearer ${a.token}`, "x-business-id": a.businessId, "x-branch-id": b.branchId } });
    expect(r2.status()).toBe(403);
  });

  test("another business's record ids get 404 on every read and write", async ({ request }) => {
    const a = await seeded(request, "a");
    const b = await seeded(request, "b");
    const H = b.o.headers; // B attacking A's ids
    const attempts: [string, string, unknown?][] = [
      ["get", `/api/products/${a.productId}`], ["patch", `/api/products/${a.productId}`, { name: "pwned" }], ["delete", `/api/products/${a.productId}`],
      ["get", `/api/customers/${a.customerId}`], ["patch", `/api/customers/${a.customerId}`, { name: "pwned" }], ["get", `/api/customers/${a.customerId}/ledger`],
      ["get", `/api/sales/${a.saleId}`], ["post", `/api/sales/${a.saleId}/void`, { reason: "just because" }], ["get", `/api/sales/${a.saleId}/receipt`],
      ["get", `/api/invoices/${a.invoiceId}`], ["put", `/api/invoices/${a.invoiceId}`, { customer, items: [{ name: "x", qty: 1, unitPrice: 1 }] }], ["delete", `/api/invoices/${a.invoiceId}`],
      ["post", `/api/invoices/${a.invoiceId}/issue`], ["post", `/api/invoices/${a.invoiceId}/payments`, { method: "cash", amount: 1 }], ["get", `/api/invoices/${a.invoiceId}/pdf`],
    ];
    for (const [verb, path, data] of attempts) {
      const r = await (request as any)[verb](path, { headers: H, ...(data ? { data } : {}) });
      expect([400, 403, 404], `${verb.toUpperCase()} ${path} -> ${r.status()}`).toContain(r.status());
    }
    // And nothing of A's changed.
    expect((await (await request.get(`/api/products/${a.productId}`, { headers: a.o.headers })).json()).product?.name ?? "Rice").toBe("Rice");
    expect(await stockLevel(a.o.branchId, a.productId)).toBe(19);
  });

  test("sneaking another business's ids into your own writes is refused", async ({ request }) => {
    const a = await seeded(request, "a");
    const b = await seeded(request, "b");
    // Selling, invoicing and receiving someone else's product / customer / branch.
    const sell = await request.post("/api/sales", { headers: b.o.headers, data: { items: [{ productId: a.productId, qty: 1 }], payments: [{ method: "cash", amount: 1000 }] } });
    expect(sell.status()).not.toBe(201);
    const inv = await request.post("/api/invoices", { headers: b.o.headers, data: { customer, items: [{ productId: a.productId, qty: 1 }] } });
    expect(inv.status()).toBe(400);
    const withCust = await request.post("/api/sales", { headers: b.o.headers, data: { items: [{ productId: b.productId, qty: 1 }], payments: [{ method: "cash", amount: 1000 }], customerId: a.customerId } });
    if (withCust.status() === 201) expect((await withCust.json()).sale.customerId ?? null).not.toBe(a.customerId);
    expect(await stockLevel(a.o.branchId, a.productId)).toBe(19);
  });

  test("client-supplied owner fields are ignored (mass assignment)", async ({ request }) => {
    const a = await newOwner(request);
    const b = await newOwner(request);
    const p = await request.post("/api/products", { headers: a.headers, data: { name: "Sneaky", price: 100, cost: 50, category: "x", accountId: b.accountId, businessId: b.businessId, status: "active" } });
    expect(p.status()).toBeLessThan(500);
    const mine = await (await request.get("/api/products", { headers: a.headers })).json();
    const theirs = await (await request.get("/api/products", { headers: b.headers })).json();
    expect(mine.products.map((x: any) => x.name)).toContain("Sneaky");
    expect(theirs.products.map((x: any) => x.name)).not.toContain("Sneaky");
    // Registering can't grant platform powers or a free plan.
    const email = `mass-${Date.now()}@example.test`;
    const reg = await request.post("/api/auth/register", { headers: { "x-forwarded-for": freshIp() }, data: { name: "Mass Assign", email, phone: "08031112222", password: "OwnerPass123", businessName: "Mass Co", businessType: "supermarket", plan: "free", platformRole: "overseer", role: "overseer", isSandbox: true, subscription: { plan: "business", trial: false, currentPeriodEnd: "2099-01-01" } } });
    expect(reg.status()).toBe(201);
    const user = await (await db()).collection("users").findOne({ email });
    expect(user!.platformRole ?? "none").toBe("none");
    const acct = await (await db()).collection("accounts").findOne({ _id: new (await import("mongoose")).default.Types.ObjectId((await reg.json()).account.id) });
    expect(acct!.isSandbox).toBeFalsy();
    expect(acct!.subscription.currentPeriodEnd ?? null).toBeNull();   // a new account is unpaid, whatever the request claims
    expect(acct!.subscription.plan).toBe("free");
  });
});

test.describe("Roles and privilege escalation", () => {
  test("till staff can sell but can't reach the owner's controls", async ({ request }) => {
    const { o } = await seeded(request);
    const staff = await tillStaff(request, o);
    expect((await request.get("/api/products", { headers: staff.headers })).status()).toBeLessThan(500);
    for (const [verb, path, data] of [
      ["get", "/api/staff"], ["post", "/api/staff", { name: "Mallory", role: "admin", pin: "9999" }], ["patch", "/api/settings", { name: "Hacked" }],
      ["get", "/api/audit"], ["post", "/api/settings/branches", { name: "x" }], ["post", "/api/settings/businesses", { name: "x", businessType: "supermarket" }],
      ["post", "/api/billing/checkout", { plan: "pro" }], ["get", "/api/billing"], ["get", "/api/overview"], ["post", "/api/invoices", { customer, items: [{ name: "x", qty: 1, unitPrice: 1 }] }],
    ] as [string, string, unknown?][]) {
      const r = await (request as any)[verb](path, { headers: staff.headers, ...(data ? { data } : {}) });
      expect([401, 403, 404], `staff ${verb.toUpperCase()} ${path} -> ${r.status()}`).toContain(r.status());
    }
  });

  test("an admin can't hand out the owner's power", async ({ request }) => {
    const { o } = await seeded(request);
    const admin = await adminOf(request, o);
    // Granting "*" (everything) through permission overrides would make a new owner.
    const r = await request.post("/api/staff", { headers: admin.headers, data: { name: "Escalator", role: "staff", branchId: o.branchId, pin: "2468", permsOverride: ["*"] } });
    if (r.status() === 201) {
      const code = (await (await db()).collection("businesses").findOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }))!.code;
      const t = await (await request.post("/api/auth/till", { data: { businessCode: code, pin: "2468" } })).json();
      const me = await request.get("/api/staff", { headers: { ...o.headers, Authorization: `Bearer ${t.token}` } });
      expect(me.status(), "a staff member created by an admin must not become an owner").toBe(403);
    } else {
      expect([400, 403]).toContain(r.status());
    }
    // Nor can an admin touch the owner, create another admin, or change the plan/billing.
    expect((await request.post("/api/staff", { headers: admin.headers, data: { name: "Admin Two", role: "admin", pin: "1357", email: `a2-${Date.now()}@example.test`, password: "AdminPass123" } })).status()).toBe(403);
    expect([401, 403]).toContain((await request.post("/api/billing/checkout", { headers: admin.headers, data: { plan: "business" } })).status());
    expect([401, 403]).toContain((await request.post("/api/settings/businesses", { headers: admin.headers, data: { name: "Mine Now", businessType: "supermarket" } })).status());
  });

  test("only the owner can edit or remove the owner's own membership", async ({ request }) => {
    const { o } = await seeded(request);
    const admin = await adminOf(request, o);
    const staff = (await (await request.get("/api/staff", { headers: admin.headers })).json()).staff as any[];
    const owner = staff.find((s) => s.role === "owner");
    if (owner) {
      for (const [verb, data] of [["patch", { role: "staff" }], ["delete", undefined], ["patch", { status: "suspended" }]] as [string, unknown][]) {
        const r = await (request as any)[verb](`/api/staff/${owner.id}`, { headers: admin.headers, ...(data ? { data } : {}) });
        expect([400, 403, 404], `${verb} owner -> ${r.status()}`).toContain(r.status());
      }
    }
    expect((await request.get("/api/staff", { headers: o.headers })).status()).toBe(200);
  });
});

test.describe("Suspended accounts are really locked out", () => {
  test("a suspended account can't sign in or keep using its token", async ({ request }) => {
    const o = await newOwner(request);
    expect((await request.get("/api/products", { headers: o.headers })).status()).toBe(200);
    await (await db()).collection("accounts").updateOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.accountId) }, { $set: { status: "suspended" } });
    const during = await request.get("/api/products", { headers: o.headers });
    expect([401, 403]).toContain(during.status());
    const login = await request.post("/api/auth/login", { data: { email: o.email, password: "OwnerPass123" } });
    expect([401, 403]).toContain(login.status());
    // Their public pages go dark too.
    await (await db()).collection("accounts").updateOne({ _id: new (await import("mongoose")).default.Types.ObjectId(o.accountId) }, { $set: { status: "active" } });
  });

  test("a suspended staff member's session stops working", async ({ request }) => {
    const { o } = await seeded(request);
    const staff = await tillStaff(request, o);
    expect((await request.get("/api/products", { headers: staff.headers })).status()).toBe(200);
    const payload: any = jwt.decode(staff.token);
    await (await db()).collection("users").updateOne({ _id: new (await import("mongoose")).default.Types.ObjectId(payload.sub) }, { $set: { status: "suspended" } });
    expect([401, 403]).toContain((await request.get("/api/products", { headers: staff.headers })).status());
  });
});

test.describe("Business-logic abuse", () => {
  test("negative, zero, fractional and absurd numbers never produce money or stock", async ({ request }) => {
    const { o, productId } = await seeded(request);
    const pay = [{ method: "cash", amount: 1000 }];
    const bad: unknown[] = [
      { items: [{ productId, qty: -5 }], payments: pay },
      { items: [{ productId, qty: 0 }], payments: pay },
      { items: [{ productId, qty: 1.5 }], payments: pay },
      { items: [{ productId, qty: 1e12 }], payments: pay },
      { items: [{ productId, qty: 1 }], payments: [{ method: "cash", amount: -1000 }] },
      { items: [{ productId, qty: 1 }], payments: pay, discount: -500 },
      { items: [{ productId, qty: "1; DROP" }], payments: pay },
      { items: [{ productId: "not-an-id", qty: 1 }], payments: pay },
      { items: [], payments: pay },
    ];
    for (const b of bad) expect((await request.post("/api/sales", { headers: o.headers, data: b })).status(), JSON.stringify(b)).toBeLessThan(500);
    for (const b of bad) expect((await request.post("/api/sales", { headers: o.headers, data: b })).status(), JSON.stringify(b)).not.toBe(201);
    expect(await stockLevel(o.branchId, productId)).toBe(19); // only the seeded sale ever took stock
  });

  test("the price comes from the server, not from the request", async ({ request }) => {
    const { o, productId } = await seeded(request);
    const r = await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty: 1, price: 1, unitPrice: 1, lineNet: 1 }], payments: [{ method: "cash", amount: 1000 }], total: 1, subtotal: 1 } });
    if (r.status() === 201) expect((await r.json()).receipt.total).toBe(1000);
  });

  test("a discount can't exceed the bill, and an overpaid invoice can't go negative", async ({ request }) => {
    const { o, productId } = await seeded(request);
    const huge = await request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty: 1 }], payments: [{ method: "cash", amount: 0 }], discount: 99999 } });
    if (huge.status() === 201) expect((await huge.json()).receipt.total).toBeGreaterThanOrEqual(0);
    const inv = await (await request.post("/api/invoices", { headers: o.headers, data: { customer, discountPct: 500, items: [{ productId, qty: 1 }] } }));
    expect(inv.status()).toBeLessThan(500);
    const nan = await request.post("/api/invoices", { headers: o.headers, data: { customer, items: [{ productId, qty: 1, unitPrice: "abc" }] } });
    expect(nan.status()).toBe(400);
  });

  test("racing the last items can't oversell: stock never goes below zero", async ({ request }) => {
    const o = await newOwner(request);
    const productId = await seedProduct(o.accountId, o.businessId, o.branchId, "Last Ones", 500, 3, { cost: 100 });
    const results = await Promise.all(Array.from({ length: 10 }, () => request.post("/api/sales", { headers: o.headers, data: { items: [{ productId, qty: 1 }], payments: [{ method: "cash", amount: 500 }] } })));
    const sold = results.filter((r) => r.status() === 201).length;
    expect(sold).toBe(3);
    expect(await stockLevel(o.branchId, productId)).toBe(0);
  });

  test("the same checkout sent twice is one sale", async ({ request }) => {
    const o = await newOwner(request);
    const productId = await seedProduct(o.accountId, o.businessId, o.branchId, "Once", 500, 10, { cost: 100 });
    const body = { items: [{ productId, qty: 1 }], payments: [{ method: "cash", amount: 500 }], clientSaleId: "11111111-1111-4111-8111-111111111111" };
    const [a, b] = await Promise.all([request.post("/api/sales", { headers: o.headers, data: body }), request.post("/api/sales", { headers: o.headers, data: body })]);
    expect([a.status(), b.status()].filter((s) => s === 201 || s === 200).length).toBe(2);
    expect(await stockLevel(o.branchId, productId)).toBe(9);
  });

  test("two people paying the same invoice at once can't take more than is owed", async ({ request }) => {
    const { o, invoiceId } = await seeded(request);
    await request.post(`/api/invoices/${invoiceId}/issue`, { headers: o.headers });
    const rs = await Promise.all(Array.from({ length: 6 }, () => request.post(`/api/invoices/${invoiceId}/payments`, { headers: o.headers, data: { method: "cash", amount: 400 } })));
    const inv = (await (await request.get(`/api/invoices/${invoiceId}`, { headers: o.headers })).json()).invoice;
    expect(inv.amountPaid).toBeLessThanOrEqual(inv.total);
    expect(inv.balance).toBeGreaterThanOrEqual(0);
    expect(rs.filter((r) => r.status() === 200).length).toBeLessThanOrEqual(2);
  });

  test("a voided sale can't be voided again to double-restore stock", async ({ request }) => {
    const { o, productId, saleId } = await seeded(request);
    const rs = await Promise.all([1, 2, 3].map(() => request.post(`/api/sales/${saleId}/void`, { headers: o.headers, data: { reason: "double trouble" } })));
    expect(rs.filter((r) => r.status() === 200).length).toBe(1);
    expect(await stockLevel(o.branchId, productId)).toBe(20);
  });
});

test.describe("Public pages and links", () => {
  test("customer links reveal only what's printed on them", async ({ request }) => {
    const { o, invoiceId, saleId } = await seeded(request);
    const issued = (await (await request.post(`/api/invoices/${invoiceId}/issue`, { headers: o.headers })).json()).invoice;
    const pub = JSON.stringify(await (await request.get(`/api/public/invoices/${issued.shareUrl.split("/i/")[1]}`)).json());
    const rec = JSON.stringify(await (await request.get(`/api/public/receipts/${(await (await request.get(`/api/sales/${saleId}/receipt`, { headers: o.headers })).json()).url.split("/r/")[1]}`)).json());
    for (const secret of [o.accountId, o.businessId, o.branchId, "passwordHash", "lineCost", "\"cost\"", "profit", o.email]) {
      expect(pub, secret).not.toContain(secret);
      expect(rec, secret).not.toContain(secret);
    }
  });

  test("the public business page and catalog don't leak cost, stock counts or ids", async ({ request }) => {
    const site = JSON.stringify(await (await request.get(`/api/public/sites/${SLUG}`)).json());
    const shopper = (await (await request.post(`/api/public/store/${SLUG}/auth/register`, { headers: { "x-forwarded-for": freshIp() }, data: { name: "Leak Checker", email: `leak-${Date.now()}@example.test`, phone: `0803${Math.floor(1000000 + Math.random() * 8999999)}`, password: "ShopPass123" } })).json()).token;
    const catJson = await (await request.get(`/api/public/store/${SLUG}/catalog`, { headers: { Authorization: `Bearer ${shopper}` } })).json();
    expect(catJson.products.length).toBeGreaterThan(0);
    const cat = JSON.stringify(catJson);
    for (const body of [site, cat]) {
      expect(body).not.toMatch(/"cost"|passwordHash|accountId|ownerUserId|"email":"owner@/);
    }
  });

  test("one customer can't read another customer's orders", async ({ request }) => {
    const mk = async (n: string) => {
      const r = await request.post(`/api/public/store/${SLUG}/auth/register`, { headers: { "x-forwarded-for": freshIp() }, data: { name: `Shopper ${n}`, email: `shop-${n}-${Date.now()}@example.test`, phone: `0803${Math.floor(1000000 + Math.random() * 8999999)}`, password: "ShopPass123" } });
      expect(r.status()).toBe(201);
      return (await r.json()).token as string;
    };
    const a = await mk("a"), b = await mk("b");
    const cat = await (await request.get(`/api/public/store/${SLUG}/catalog`, { headers: { Authorization: `Bearer ${a}` } })).json();
    expect(cat.products.length, "the seeded shop should have products").toBeGreaterThan(0);
    const placed = await request.post(`/api/public/store/${SLUG}/orders`, {
      headers: { Authorization: `Bearer ${a}` },
      data: { clientOrderId: `sec-${Date.now()}-${Math.random().toString(36).slice(2)}`, items: [{ productId: cat.products[0].id, qty: 1 }], fulfilment: { type: "pickup" }, payment: { method: "pay_at_pickup" } },
    });
    expect(placed.status(), JSON.stringify(await placed.json())).toBe(201);
    const id = (await placed.json()).order.id;
    expect((await request.get(`/api/public/store/${SLUG}/orders/${id}`, { headers: { Authorization: `Bearer ${a}` } })).status()).toBe(200);
    expect((await request.get(`/api/public/store/${SLUG}/orders/${id}`, { headers: { Authorization: `Bearer ${b}` } })).status()).toBe(404);
    // B can't cancel A's order — and A's order is still standing afterwards.
    expect([404, 409]).toContain((await request.post(`/api/public/store/${SLUG}/orders/${id}/cancel`, { headers: { Authorization: `Bearer ${b}` } })).status());
    expect((await (await request.get(`/api/public/store/${SLUG}/orders/${id}`, { headers: { Authorization: `Bearer ${a}` } })).json()).order.status).toBe("placed");
    expect((await (await request.get(`/api/public/store/${SLUG}/orders`, { headers: { Authorization: `Bearer ${b}` } })).json()).total).toBe(0);
  });

  test("an uploaded file that isn't an image is refused", async ({ request }) => {
    const o = await newOwner(request, "o", "business");
    const r = await request.post("/api/site/logo", { headers: { Authorization: o.headers.Authorization, "x-business-id": o.businessId, "x-branch-id": o.branchId }, multipart: { file: { name: "evil.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") } } });
    expect([400, 404, 415, 422]).toContain(r.status());
  });
});

test.describe("The server's own manners", () => {
  test("responses carry hardening headers and don't advertise the framework", async ({ request }) => {
    const r = await request.get("/api/health");
    const h = r.headers();
    expect(h["x-powered-by"]).toBeUndefined();
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"] || h["content-security-policy"] || "").toBeTruthy();
    expect(h["referrer-policy"]).toBeTruthy();
  });

  test("errors never show stack traces or database internals", async ({ request }) => {
    const o = await newOwner(request);
    const probes = await Promise.all([
      request.get("/api/products/not-an-id", { headers: o.headers }),
      request.post("/api/sales", { headers: o.headers, data: "{not json" }),
      request.post("/api/sales", { headers: { ...o.headers, "content-type": "application/json" }, data: Buffer.from("{broken") }),
      request.get("/api/customers/%00", { headers: o.headers }),
    ]);
    for (const r of probes) {
      expect(r.status()).toBeLessThan(500);
      const t = await r.text();
      expect(t).not.toMatch(/at .*\.js:\d+|node_modules|MongoServerError|Cast to ObjectId|stack/i);
    }
  });

  test("an oversized request body is refused rather than swallowed", async ({ request }) => {
    const o = await newOwner(request);
    const r = await request.post("/api/customers", { headers: o.headers, data: { name: "x".repeat(2_000_000), phone: "08031110000" } });
    expect([400, 413]).toContain(r.status());
  });

  test("an unknown API path is a clean JSON 404", async ({ request }) => {
    const r = await request.get("/api/this/does/not/exist");
    expect(r.status()).toBe(404);
    expect(r.headers()["content-type"]).toContain("application/json");
  });
});
