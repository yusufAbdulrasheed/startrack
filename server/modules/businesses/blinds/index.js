/**
 * Window Blinds & Curtains — the manifest for this business vertical.
 *
 * There is no blinds-specific route, model, or service file, and none is
 * needed: blinds' entire defining behavior — priced per square metre, cut
 * from stock you already hold — IS the `made_to_order` capability, and that
 * capability is genuinely shared with tailoring, furniture, restaurant,
 * printing and electronics. Forking a blinds-only copy of it would create a
 * second implementation for those other five trades to drift out of sync
 * with — the exact regression this reorganization's shared-core decision
 * was written to avoid.
 *
 * Where the real logic lives:
 *
 *   made_to_order (module) → server/modules/products/product.model.js's
 *     `bom` field (per: sqm/width/height/unit, factor) + validateBom() in
 *     products.routes.js, and the checkout-time expansion in
 *     server/modules/sales/sales.routes.js (dimensions required, quantity
 *     per component computed from width × height, void/return restores the
 *     components — not the blind itself, which was never stock).
 *   jobs (capability) → server/modules/jobs/ (shared, see the electronics
 *     manifest for why this stays a single generic implementation).
 *
 * This file exists so "every business has its own directory" is true to
 * read, not just true in theory — this directory's job is to say plainly
 * that blinds' logic is real, complete, and correctly lives elsewhere.
 */
export const BLINDS_COMPOSITION = {
  capabilities: ["jobs"],
  modules: ["made_to_order"],
  implementedIn: [
    "#modules/products/product.model.js (bom)",
    "#modules/products/products.routes.js (validateBom)",
    "#modules/sales/sales.routes.js (checkout expansion)",
    "#modules/jobs/ (shared)",
  ],
};
