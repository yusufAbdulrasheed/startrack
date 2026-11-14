/**
 * The contract every business service signs.
 *
 * StarTrack is a platform plus independent business services. A business
 * (supermarket, blinds, electronics, academy, poultry, water) lives entirely in
 * server/businesses/<key>/ and plugs into the platform through the shape
 * defined here, and ONLY through it:
 *
 *   - It may import the platform's public interface (`#platform/index.js`),
 *     third-party packages, and its own files. Never another business, never a
 *     platform module's internals. `npm run check:architecture` enforces this.
 *   - The platform never imports a business. It looks a business up by its key
 *     in the registry and calls whatever the business registered here.
 *
 * Everything below is optional except `manifest`. A plain shop (supermarket)
 * registers nothing but a manifest and demo data: the platform already knows
 * how to run a shop.
 *
 *   manifest   Plain data, safe to load in the browser too (see manifest.js in
 *              each business): name, wording, categories, features, the pages
 *              the business adds to the menu.
 *   routes     [{ path, router, feature? }] API routers this business owns.
 *              The platform mounts each behind sign-in, the tenant context and
 *              a check that the caller's business IS this business type, so
 *              /api/cohorts answers only to a poultry farm.
 *   checkout   How this business's items are sold (see below).
 *   imports    Spreadsheet import targets only this business has.
 *   ai         What the assistant knows about this business.
 *   demo       Sample data for the demo sandbox and the showcase accounts.
 *
 * checkout hooks, called by the one shared checkout (sales/checkout.service):
 *   archetypes   { [archetype]: { lines(env) → lines[] } } — turns cart items of
 *                a product archetype this business owns (made_to_order, service)
 *                into priced sale lines. A line carries `components` (stock to
 *                consume instead of its own) or `service: true` (no stock).
 *   validate     async (env) → { commit?(session, sale) } — runs before stock
 *                moves; throw to refuse the sale; `commit` runs once the sale
 *                exists (electronics marks serial numbers sold here).
 *   onCustomerSale  async (env) — runs when a sale has a customer, inside the
 *                transaction (water counts loyalty tokens here).
 *   env = { ctx, items, byId, lines, session, ... } — see checkout.service.js.
 */

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function fail(key, problem) {
  throw new Error(`Business service "${key}": ${problem}`);
}

/** Validates and freezes a business service. Called once per business at boot. */
export function defineBusinessService(def) {
  const m = def?.manifest;
  if (!m || typeof m.key !== "string" || !/^[a-z][a-z0-9_]*$/.test(m.key)) fail(m?.key || "?", "needs a manifest with a lowercase key");
  const key = m.key;
  if (!m.label || !m.terminology?.products || !m.posLabel) fail(key, "manifest needs label, terminology.products and posLabel");
  if (!Array.isArray(m.defaultCategories) || !Array.isArray(m.modules)) fail(key, "manifest needs defaultCategories and modules");

  const routes = asArray(def.routes).map((r) => {
    if (!r?.path?.startsWith("/api/") || !r.router) fail(key, `a route needs an /api/... path and a router (got ${r?.path})`);
    return { feature: "verticals", ...r };
  });

  const checkout = def.checkout || {};
  for (const [name, h] of Object.entries(checkout.archetypes || {})) {
    if (typeof h?.lines !== "function") fail(key, `checkout archetype "${name}" needs a lines() function`);
  }

  return Object.freeze({
    key,
    manifest: m,
    routes,
    checkout,
    imports: asArray(def.imports),
    ai: def.ai || {},
    demo: def.demo || null,
  });
}
