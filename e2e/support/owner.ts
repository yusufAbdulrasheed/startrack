import { expect, type APIRequestContext } from "@playwright/test";
import { db, payFor } from "./db";

let n = 0;
let ipn = 0;

/**
 * A made-up client address for the request. Sign-ups are throttled per address, and
 * every test registers its own owner from this one machine, so each gets its own
 * "address" (the API trusts X-Forwarded-For from the dev proxy).
 */
export const freshIp = () => `10.${(Date.now() >> 4) & 255}.${(++ipn >> 8) & 255}.${ipn & 255}`;
const stamp = Date.now().toString(36);

/**
 * A brand-new account (so it is on the 14-day Pro trial, with every Pro feature),
 * plus the headers an owner's API calls need. Each test makes its own, so tests
 * never depend on each other's data.
 */
export async function newOwner(request: APIRequestContext, tag = "o", signedUpFor: "free" | "pro" | "business" = "free") {
  const id = `${tag}-${++n}`;
  const email = `${id}-${stamp}@example.test`;
  const res = await request.post("/api/auth/register", {
    headers: { "x-forwarded-for": freshIp() },
    data: { name: "Test Owner", email, phone: "08031112222", password: "OwnerPass123", businessName: `Shop ${id}`, businessType: "supermarket", plan: signedUpFor },
  });
  expect(res.status()).toBe(201);
  const s = await res.json();
  // A new account is asked to verify its email and phone (a popup that would cover every screen); these tests are about other things.
  await (await db()).collection("users").updateOne({ email }, { $set: { emailVerified: true, phoneVerified: true } });
  // Plans are paid: a new account is view-only until its first payment, so pay for what it signed up for.
  expect((await payFor(s.account.id, signedUpFor)).ok).toBe(true);
  const ids = { accountId: s.account.id as string, businessId: s.businesses[0].id as string, branchId: s.branches[0].id as string };
  return { email, ...ids, token: s.token as string, headers: { Authorization: `Bearer ${s.token}`, "x-business-id": ids.businessId, "x-branch-id": ids.branchId } as Record<string, string> };
}
export type Owner = Awaited<ReturnType<typeof newOwner>>;

/** Upload a CSV the way the browser does: multipart, with the options as form fields. */
export const uploadCsv = (request: APIRequestContext, url: string, o: Owner, csv: string, fields: Record<string, string> = {}) =>
  request.post(url, { headers: o.headers, multipart: { file: { name: "data.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }, ...fields } });
