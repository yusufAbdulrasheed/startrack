/**
 * Which plan each seeded showcase business sits on, so every plan can be tried
 * with a real login. Spread across trades on purpose: a tight Freemium shop, a
 * mid-size Pro business and a Business-plan operation with everything on.
 *
 * Used by seedShowcase.js (new accounts get their plan at creation) and by
 * assignPlans.js (existing accounts are moved onto it).
 */
export const SHOWCASE_OWNER_PASSWORD = "Demo@1234";

export const SHOWCASE_PLANS = {
  // Freemium: the light, single-shop experience
  supermarket: "free",
  laundry: "free",
  water: "free",
  blinds: "free",
  // Pro: AI, barcodes, loyalty, transfers, expiry, suppliers, custom receipt
  restaurant: "pro",
  electronics: "pro",
  gym: "pro",
  salon: "pro",
  poultry: "pro",
  // Business: everything, including receipt templates and the landing page
  hotel: "business",
  academy: "business",
  agency: "business",
  coldroom: "business",
};

/** A paid-up subscription that stays valid for testing. */
export function showcaseSubscription(plan, days = 365) {
  return { plan, trial: false, currentPeriodEnd: new Date(Date.now() + days * 86_400_000), payments: [] };
}
