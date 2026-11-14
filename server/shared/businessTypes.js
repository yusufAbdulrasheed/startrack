import { MANIFESTS } from "../businesses/manifests.js";

/**
 * The business types StarTrack runs, assembled from the manifests in
 * server/businesses/<key>/manifest.js. A business defines ITSELF there; this
 * file only gathers them and adds what the platform itself provides (the
 * optional modules and capabilities every business may use).
 *
 * Read by the server (to know what a business may do) and by the browser (to
 * word screens and build the menu), so they never disagree.
 */

/** Optional modules the platform offers. A business may also own modules (manifest.ownsModules). */
const PLATFORM_MODULES = [
  { key: "returns", label: "Returns", hint: "Customer returns with manager approval" },
  { key: "transfers", label: "Branch transfers", hint: "Move stock between branches" },
  { key: "customers", label: "Customers", hint: "Track who buys and how much" },
  { key: "expenses", label: "Expenses", hint: "Record spending against profit" },
  { key: "attendance", label: "Attendance", hint: "Staff clock in / clock out" },
  { key: "expiry", label: "Expiry tracking", hint: "Expiry dates and expiring-soon alerts" },
  { key: "suppliers", label: "Suppliers", hint: "Track who you buy from and what they charge" },
  { key: "stock_count", label: "Stock counts", hint: "Periodic physical counts reconciled against the system" },
  // A plain POS discount reward any business can switch on — see server/modules/loyalty/.
  { key: "loyaltyCard", label: "Loyalty cards", hint: "QR loyalty cards for regulars, with a scan-to-apply discount" },
];

/** Capabilities the platform itself provides; a business opts in by listing one. */
const PLATFORM_CAPABILITIES = {
  jobs: { label: "Job tickets", hint: "Work taken in, worked on over days, collected — with a stage per ticket" },
  credit: { label: "Customer credit", hint: "Supply now, invoice later, chase the balance" },
};

const ownedModules = MANIFESTS.flatMap((m) => (m.ownsModules || []).map((x) => ({ ...x, owner: m.key })));

/** Every optional module that exists, with `owner` set on those only one business can use. */
export const TOGGLEABLE_MODULES = [...PLATFORM_MODULES, ...ownedModules];

export const ALL_TOGGLEABLE = TOGGLEABLE_MODULES.map((m) => m.key);

/** The optional modules THIS business may be offered (its own, plus the platform's — never another business's). */
export const modulesAvailableTo = (typeKey) => TOGGLEABLE_MODULES.filter((m) => !m.owner || m.owner === typeKey);

/** Every capability: the platform's, plus what each business declares for itself. */
export const CAPABILITIES = Object.assign({}, PLATFORM_CAPABILITIES, ...MANIFESTS.map((m) => m.capabilityInfo || {}));

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES);

export const BUSINESS_TYPES = Object.fromEntries(MANIFESTS.map((m) => [m.key, m]));

// The fallback for a typeKey that isn't one of the businesses above — an account
// created before a business was retired, or a key that simply doesn't exist.
// Never selectable (it isn't in BUSINESS_TYPES), just a safe plain-retail
// default so typeTemplate() never returns undefined.
const DEFAULT_TEMPLATE = {
  key: "general",
  label: "General Business",
  terminology: { products: "Products" },
  posLabel: "Point of Sale",
  defaultCategories: ["General"],
  modules: PLATFORM_MODULES.map((m) => m.key),
  tagline: "Everything on, trim later",
  capabilities: [],
  nav: [],
};

export function typeTemplate(typeKey) {
  return BUSINESS_TYPES[typeKey] || DEFAULT_TEMPLATE;
}

/** Does this business support a given capability? */
export function hasCapability(typeKey, capability) {
  return (typeTemplate(typeKey).capabilities || []).includes(capability);
}

/** Every business that has a given capability. */
export function typesWithCapability(capability) {
  return Object.entries(BUSINESS_TYPES)
    .filter(([, t]) => (t.capabilities || []).includes(capability))
    .map(([key]) => key);
}
