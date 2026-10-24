/**
 * The three subscription plans, and which feature belongs to which. This one
 * file is read by the server (to refuse what a plan doesn't include) and by the
 * app and landing page (to show what each plan includes) — so what a plan
 * promises and what it enforces can never drift apart.
 *
 * Every plan is paid: Freemium is just the lightest and cheapest one. Prices are
 * in naira per month. They are placeholders until the owner of the
 * product sets real ones, and they live ONLY here so the landing page, the
 * billing screen and the payment amount can never disagree.
 */

export const PLAN_ORDER = ["free", "pro", "business"];

/** New accounts try the plan they chose for this long before paying. */
export const TRIAL_DAYS = 14;

export const PLANS = {
  free: {
    key: "free",
    name: "Freemium",
    tagline: "Run one shop, the simple way",
    price: 2000,
    // null = unlimited
    limits: { businesses: 1, branches: 1, staff: 2, products: 50 },
    highlights: [
      "1 business, 1 branch",
      "Up to 50 products",
      "2 staff accounts",
      "Point of sale & sales history",
      "Stock in & basic inventory",
      "Customers & expenses",
      "Basic dashboard",
      "Standard receipt",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "Grow with AI and smarter stock",
    price: 7500,
    limits: { businesses: 1, branches: 3, staff: 10, products: 2000 },
    highlights: [
      "Everything in Freemium",
      "AI assistant & Ask AI",
      "PDF & Excel reports",
      "Spreadsheet import, read by AI",
      "Barcodes & label printing",
      "Loyalty cards",
      "Branch transfers",
      "Expiry tracking",
      "Suppliers & stock counts",
      "Custom receipt (no template)",
      "Up to 3 branches, 10 staff",
    ],
  },
  business: {
    key: "business",
    name: "Business",
    tagline: "Everything, for serious operators",
    price: 20000,
    limits: { businesses: null, branches: null, staff: null, products: null },
    highlights: [
      "Everything in Pro",
      "Unlimited branches, staff & products",
      "Multiple businesses + All-stores dashboard",
      "Receipt templates & AI receipt writer",
      "Your own business landing page",
      "Audit log",
      "Priority support",
    ],
  },
};

/** Each gated feature, and the lowest plan that includes it. Anything not listed is free. */
export const FEATURES = {
  ai: { plan: "pro", label: "AI assistant", blurb: "Ask questions about your business, draft actions and import spreadsheets." },
  reports: { plan: "pro", label: "Reports", blurb: "Download PDF and Excel reports." },
  advancedDashboard: { plan: "pro", label: "Full dashboard", blurb: "Inventory, movement, customers, staff and archive views, on top of Overview, Sales and Expenses." },
  barcodes: { plan: "pro", label: "Barcodes & labels", blurb: "Scan products at the till and print barcode labels." },
  loyalty: { plan: "pro", label: "Loyalty cards", blurb: "Reward repeat customers with QR loyalty cards." },
  transfers: { plan: "pro", label: "Branch transfers", blurb: "Move stock between your branches." },
  expiry: { plan: "pro", label: "Expiry tracking", blurb: "Track expiry dates and get warned before stock goes off." },
  suppliers: { plan: "pro", label: "Suppliers", blurb: "Keep supplier records and what you buy from them." },
  stockCount: { plan: "pro", label: "Stock counts", blurb: "Count stock and reconcile differences." },
  returns: { plan: "pro", label: "Returns & refunds", blurb: "Process returns with approvals." },
  attendance: { plan: "pro", label: "Attendance", blurb: "Clock staff in and out." },
  csvImport: { plan: "pro", label: "Bulk import", blurb: "Import products from a spreadsheet." },
  productPhotos: { plan: "pro", label: "Product photos", blurb: "Add photos to products, or find them by name." },
  verticals: { plan: "pro", label: "Trade-specific tools", blurb: "Rooms, memberships, classes, appointments, kitchen queue, cold room and more." },
  receiptCustom: { plan: "pro", label: "Custom receipt", blurb: "Set your receipt's header, footer and what it shows." },
  receiptTemplates: { plan: "business", label: "Receipt templates", blurb: "Pick a designed receipt layout and let AI write your message." },
  multiStore: { plan: "business", label: "All-stores dashboard", blurb: "Profit, loss and stock across all your businesses." },
  sitePage: { plan: "business", label: "Business landing page", blurb: "Your own public page, customised to your brand." },
  auditLog: { plan: "business", label: "Audit log", blurb: "See who changed what, and when." },
};

export const planRank = (plan) => Math.max(0, PLAN_ORDER.indexOf(plan));
export const isPlan = (v) => PLAN_ORDER.includes(v);

/** Does this plan include this feature? Unknown features are open to everyone. */
export function planAllows(plan, feature) {
  const f = FEATURES[feature];
  return !f || planRank(plan) >= planRank(f.plan);
}

export const requiredPlanFor = (feature) => FEATURES[feature]?.plan || "free";

/** Every feature key this plan includes. */
export const featuresFor = (plan) => Object.keys(FEATURES).filter((k) => planAllows(plan, k));

/** A plan's cap for "businesses" | "branches" | "staff" | "products"; null = unlimited. */
export const limitOf = (plan, name) => (PLANS[plan] || PLANS.free).limits[name] ?? null;

/**
 * Where an account stands.
 *  - demo sandboxes show everything;
 *  - accounts created before plans existed have no subscription and keep full access;
 *  - everyone else has a plan that runs until `periodEnd` (a trial first, then
 *    each payment). Once that passes the account is `lapsed`: it drops to the
 *    lightest feature set and the server pauses changes until it renews.
 */
export function planStatus(account, now = new Date()) {
  if (!account) return { plan: "free", lapsed: true, trial: false, legacy: false, periodEnd: null };
  if (account.isSandbox) return { plan: "business", lapsed: false, trial: false, legacy: false, periodEnd: null };
  const sub = account.subscription;
  if (!sub || !sub.plan) return { plan: "business", lapsed: false, trial: false, legacy: true, periodEnd: null };
  const end = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
  const lapsed = !isPlan(sub.plan) || !end || end < now;
  return { plan: lapsed ? "free" : sub.plan, lapsed, trial: !lapsed && !!sub.trial, legacy: false, periodEnd: end };
}

/** The plan whose features apply right now. */
export const effectivePlan = (account, now) => planStatus(account, now).plan;

/** True when the account predates plans and was carried over with full access. */
export const isLegacyAccount = (account) => !!account && !account.isSandbox && (!account.subscription || !account.subscription.plan);
