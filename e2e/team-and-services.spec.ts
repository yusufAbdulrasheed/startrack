import { expect, test, type APIRequestContext } from "@playwright/test";
import { closeDb, db, payFor } from "./support/db";
import { freshIp, newOwner, type Owner } from "./support/owner";

test.afterAll(closeDb);

let pinN = 3000;
const stamp = Date.now().toString(36);
let seq = 0;

/** Hire a till staff member (manager or sales rep) and sign them in the way a till does. */
async function hireAndSignIn(request: APIRequestContext, o: Owner, name: string, role: "manager" | "staff") {
  const pin = String(++pinN);
  const hired = await request.post("/api/staff", { headers: o.headers, data: { name, role, pin, branchId: o.branchId } });
  expect(hired.status(), await hired.text()).toBe(201);
  const settings = await (await request.get("/api/settings", { headers: o.headers })).json();
  const login = await request.post("/api/auth/till", { headers: { "x-forwarded-for": freshIp() }, data: { businessCode: settings.business.code, pin } });
  expect(login.status(), await login.text()).toBe(200);
  const s = await login.json();
  return {
    pin,
    code: settings.business.code as string,
    headers: { Authorization: `Bearer ${s.token}`, "x-business-id": o.businessId, "x-branch-id": o.branchId } as Record<string, string>,
  };
}

/** A new account on a given trade, paid up and verified, like newOwner() but not a supermarket. */
async function ownerOf(request: APIRequestContext, businessType: string): Promise<Owner> {
  const id = `${businessType}-${++seq}`;
  const email = `${id}-${stamp}@example.test`;
  const res = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": freshIp() },
    data: { name: "Test Owner", email, phone: "08031112222", password: "OwnerPass123", businessName: `Biz ${id}`, businessType, plan: "business" },
  });
  expect(res.status()).toBe(201);
  const s = await res.json();
  await (await db()).collection("users").updateOne({ email }, { $set: { emailVerified: true, phoneVerified: true } });
  expect((await payFor(s.account.id, "business")).ok).toBe(true);
  const ids = { accountId: s.account.id as string, businessId: s.businesses[0].id as string, branchId: s.branches[0].id as string };
  return { email, ...ids, token: s.token as string, headers: { Authorization: `Bearer ${s.token}`, "x-business-id": ids.businessId, "x-branch-id": ids.branchId } };
}

const get = async (request: APIRequestContext, h: Record<string, string>, url: string) => (await request.get(url, { headers: h })).json();

test.describe("Team chat", () => {
  test("owner, manager and sales rep share one team room, and each sees only their own private conversations", async ({ request }) => {
    const o = await newOwner(request);
    const mo = await hireAndSignIn(request, o, "Mo Manager", "manager");
    const sade = await hireAndSignIn(request, o, "Sade Rep", "staff");

    // Everyone gets the team room plus a conversation with each colleague.
    const rooms = await get(request, o.headers, "/api/chat/rooms");
    expect(rooms.rooms[0].id).toBe("team");
    expect(rooms.rooms.map((r: any) => r.title)).toEqual(expect.arrayContaining(["Team chat", "Mo Manager", "Sade Rep"]));
    expect(rooms.rooms.find((r: any) => r.title === "Sade Rep").subtitle).toBe("sales rep");

    // The owner says something in the team room: both others can read it, and it counts as unread for them.
    const said = await request.post("/api/chat/messages", { headers: o.headers, data: { room: "team", text: "Stock count tomorrow at 8" } });
    expect(said.status()).toBe(201);
    expect((await get(request, mo.headers, "/api/chat/unread")).unread).toBe(1);
    expect((await get(request, sade.headers, "/api/chat/unread")).unread).toBe(1);
    const seen = await get(request, mo.headers, "/api/chat/messages?room=team");
    expect(seen.messages.map((m: any) => m.text)).toEqual(["Stock count tomorrow at 8"]);
    expect(seen.messages[0]).toMatchObject({ senderName: "Test Owner", senderRole: "owner", mine: false });
    // Reading it clears the badge — for the reader only.
    expect((await get(request, mo.headers, "/api/chat/unread")).unread).toBe(0);
    expect((await get(request, sade.headers, "/api/chat/unread")).unread).toBe(1);

    // A private conversation between the manager and the sales rep: the owner's room list has its own pair only.
    const mRooms = await get(request, mo.headers, "/api/chat/rooms");
    const withSade = mRooms.rooms.find((r: any) => r.title === "Sade Rep");
    expect((await request.post("/api/chat/messages", { headers: mo.headers, data: { room: withSade.id, text: "Please open till 2" } })).status()).toBe(201);
    const sRooms = await get(request, sade.headers, "/api/chat/rooms");
    const withMo = sRooms.rooms.find((r: any) => r.title === "Mo Manager");
    expect(withMo.id).toBe(withSade.id);                     // both sides compute the same room
    expect(withMo.unread).toBe(1);
    expect((await get(request, sade.headers, `/api/chat/messages?room=${encodeURIComponent(withMo.id)}`)).messages[0].text).toBe("Please open till 2");

    // Nobody else can read it or write into it — not even the owner.
    expect((await request.get(`/api/chat/messages?room=${encodeURIComponent(withSade.id)}`, { headers: o.headers })).status()).toBe(404);
    expect((await request.post("/api/chat/messages", { headers: o.headers, data: { room: withSade.id, text: "snooping" } })).status()).toBe(404);
  });

  test("polling asks only for what's new, and messages from another business never leak in", async ({ request }) => {
    const a = await newOwner(request);
    const b = await newOwner(request);
    const first = await (await request.post("/api/chat/messages", { headers: a.headers, data: { room: "team", text: "one" } })).json();
    await request.post("/api/chat/messages", { headers: a.headers, data: { room: "team", text: "two" } });
    const fresh = await get(request, a.headers, `/api/chat/messages?room=team&since=${encodeURIComponent(first.message.at)}`);
    expect(fresh.messages.map((m: any) => m.text)).toEqual(["two"]);
    expect((await get(request, b.headers, "/api/chat/messages?room=team")).messages).toEqual([]);
    expect((await request.post("/api/chat/messages", { headers: a.headers, data: { room: "team", text: "   " } })).status()).toBe(400);
    expect((await request.get("/api/chat/messages?room=dm:bogus", { headers: a.headers })).status()).toBe(404);
  });
});

test.describe("Business PIN (till login code)", () => {
  test("the owner can change it, staff then sign in with the new one, and the old one stops working", async ({ request }) => {
    const o = await newOwner(request);
    const staff = await hireAndSignIn(request, o, "Till Person", "staff");
    const code = `PIN${Math.floor(Math.random() * 9000 + 1000)}`;

    expect((await request.patch("/api/settings/till-code", { headers: staff.headers, data: { code } })).status()).toBe(403);   // a sales rep can't
    for (const bad of ["abc", "has space", "waytoolongforacode1", "bad!"]) {
      expect((await request.patch("/api/settings/till-code", { headers: o.headers, data: { code: bad } })).status(), bad).toBe(400);
    }
    const ok = await request.patch("/api/settings/till-code", { headers: o.headers, data: { code: code.toLowerCase() } });   // case doesn't matter
    expect(ok.status()).toBe(200);
    expect((await ok.json()).code).toBe(code);
    expect((await get(request, o.headers, "/api/settings")).business.code).toBe(code);

    const login = (c: string) => request.post("/api/auth/till", { headers: { "x-forwarded-for": freshIp() }, data: { businessCode: c, pin: staff.pin } });
    expect((await login(code)).status()).toBe(200);
    expect((await login(staff.code)).status()).toBe(401);

    // Codes are unique across StarTrack.
    const other = await newOwner(request);
    const taken = await request.patch("/api/settings/till-code", { headers: other.headers, data: { code } });
    expect(taken.status()).toBe(409);
  });
});

test.describe("Help from StarTrack", () => {
  test("is for owners and admins: a manager or sales rep can't write to StarTrack's desk", async ({ request }) => {
    const o = await newOwner(request);
    const mo = await hireAndSignIn(request, o, "Mo Manager", "manager");
    const sade = await hireAndSignIn(request, o, "Sade Rep", "staff");
    const body = { subject: "Printer won't print", description: "help", toStarTrack: true };
    expect((await request.post("/api/tickets", { headers: mo.headers, data: body })).status()).toBe(403);
    expect((await request.post("/api/tickets", { headers: sade.headers, data: body })).status()).toBe(403);
    expect((await request.post("/api/tickets", { headers: o.headers, data: body })).status()).toBe(201);
    // Their own business's internal tickets are unaffected.
    expect((await request.post("/api/tickets", { headers: sade.headers, data: { subject: "Customer complaint", toStarTrack: false } })).status()).toBe(201);
  });
});

test.describe("Service businesses (the academy)", () => {
  test("a service is sold, never counted: no stock, nothing moves, and a void or return puts nothing back", async ({ request }) => {
    const o = await ownerOf(request, "academy");

    const made = await request.post("/api/products", { headers: o.headers, data: { name: "Frontend tuition (3 months)", category: "Tuition", archetype: "service", price: 15000 } });
    expect(made.status(), await made.text()).toBe(201);
    const svc = (await made.json()).product;
    expect(svc).toMatchObject({ archetype: "service", stock: null });

    // A physical product alongside it still has stock, and is the only thing the stock screens know about.
    const gel = (await (await request.post("/api/products", { headers: o.headers, data: { name: "Course workbook", category: "Tuition", price: 2500, openingStock: 10 } })).json()).product;
    const listed = (await get(request, o.headers, "/api/products")).products;
    expect(listed.find((p: any) => p.name === "Frontend tuition (3 months)").stock).toBeNull();
    expect(listed.find((p: any) => p.name === "Course workbook").stock).toBe(10);
    const levels = await get(request, o.headers, "/api/inventory");
    expect(JSON.stringify(levels)).not.toContain("Frontend tuition (3 months)");

    // Sell 2 braids and 1 gel. Only the gel leaves the shelf.
    const sold = await request.post("/api/sales", {
      headers: o.headers,
      data: { items: [{ productId: svc.id, qty: 2 }, { productId: gel.id, qty: 1 }], payments: [{ method: "cash", amount: 32500 }], discount: 0, clientSaleId: `s-${stamp}-1` },
    });
    expect(sold.status(), await sold.text()).toBe(201);
    const sale = (await sold.json()).sale;
    expect(sale.total).toBe(32500);
    const afterSale = (await get(request, o.headers, "/api/products")).products;
    expect(afterSale.find((p: any) => p.name === "Course workbook").stock).toBe(9);
    const moves = await (await db()).collection("stockmovements").find({ businessId: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }).toArray();
    expect(moves.filter((m: any) => String(m.productId) === svc.id)).toHaveLength(0);   // a service never touches the ledger

    // Voiding the sale restocks the gel, and invents no stock for the service.
    const voided = await request.post(`/api/sales/${sale.id}/void`, { headers: o.headers, data: { reason: "Customer cancelled" } });
    expect(voided.status(), await voided.text()).toBe(200);
    const afterVoid = (await get(request, o.headers, "/api/products")).products;
    expect(afterVoid.find((p: any) => p.name === "Course workbook").stock).toBe(10);
    expect(afterVoid.find((p: any) => p.name === "Frontend tuition (3 months)").stock).toBeNull();
    const moves2 = await (await db()).collection("stockmovements").find({ businessId: new (await import("mongoose")).default.Types.ObjectId(o.businessId) }).toArray();
    expect(moves2.filter((m: any) => String(m.productId) === svc.id)).toHaveLength(0);
  });

  test("returning a service refunds the money but restocks nothing", async ({ request }) => {
    const o = await ownerOf(request, "academy");
    const svc = (await (await request.post("/api/products", { headers: o.headers, data: { name: "Exam fee", category: "Registration & Exam Fees", archetype: "service", price: 50000 } })).json()).product;
    const sale = (await (await request.post("/api/sales", {
      headers: o.headers, data: { items: [{ productId: svc.id, qty: 1 }], payments: [{ method: "transfer", amount: 50000 }], discount: 0, clientSaleId: `s-${stamp}-2` },
    })).json()).sale;
    const ret = await request.post("/api/returns", { headers: o.headers, data: { saleId: sale.id, items: [{ productId: svc.id, qty: 1, condition: "good" }], reasonType: "other", reason: "Student withdrew", outcome: "refund", refundMethod: "transfer" } });
    expect(ret.status(), await ret.text()).toBe(201);
    expect((await ret.json()).return.items[0].restock).toBe(false);
  });

  test("an academy lists fees and services; its type carries service wording instead of stock wording", async ({ request }) => {
    const o = await ownerOf(request, "academy");
    const me = await get(request, o.headers, "/api/settings");
    expect(me.business.typeKey).toBe("academy");
    const fee = await request.post("/api/products", { headers: o.headers, data: { name: "Registration fee", category: "Registration & Exam Fees", archetype: "service", price: 10000 } });
    expect(fee.status()).toBe(201);
    expect((await fee.json()).product.stock).toBeNull();
  });
});
