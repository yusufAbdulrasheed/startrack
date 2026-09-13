/**
 * Restaurant / Eatery — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): production, kitchenQueue, folio.
 * Modules: made_to_order, suppliers, stock_count (all enabled by default).
 *
 *   kitchenQueue  → kitchenQueue.routes.js (this directory) — a sale's
 *                   items get a prep status (pending/preparing/ready/served)
 *                   when the selling business has this capability; every
 *                   other business type's checkout is unaffected (the field
 *                   simply stays unset). Replaces the old `kitchen`
 *                   capability grant, which had zero implementation — not
 *                   to be confused with hotel's own unrelated `kitchen`
 *                   grant (an outlet posting a folio charge).
 *   production    → server/modules/production/ (shared with bakery,
 *                   furniture, printing) — batch prep: raw ingredients
 *                   (rice, chicken, stew mix) consumed to credit a prepared
 *                   item's stock, same engine water uses for bottling.
 *   recipes (bom) → server/modules/products/ + server/modules/sales/
 *                   (shared `made_to_order` capability) — a menu item's
 *                   recipe deducts its ingredients live at checkout; a
 *                   plain `per: "unit"` recipe sells in one tap, no
 *                   dimensions needed (see sales.routes.js's `needsDims`).
 *   suppliers     → server/modules/suppliers/ — market vendors and
 *                   distributors, cost-per-delivery captured at stock-in.
 *   stock_count   → server/modules/inventory/ (stockCount.model.js,
 *                   stockCount.routes.js) — physical counts reconciled
 *                   against the system, posting variances as ordinary
 *                   ADJUST movements.
 *   folio         → declared but not consumed by restaurant's own routes
 *                   today (restaurant sells through the ordinary POS, not
 *                   a running bill) — kept for a future dine-in-tab
 *                   feature, not implemented in this pass.
 *
 * Only kitchenQueue.routes.js is genuinely restaurant-specific code; every
 * other capability above is a shared implementation this business type
 * composes, exactly per this reorganization's shared-core decision.
 */
export const RESTAURANT_COMPOSITION = {
  capabilities: ["production", "kitchenQueue", "folio"],
  modules: ["made_to_order", "suppliers", "stock_count"],
  implementedIn: [
    "./kitchenQueue.routes.js",
    "#modules/production/ (production)",
    "#modules/products/ + #modules/sales/sales.routes.js (recipes/bom)",
    "#modules/suppliers/ (suppliers)",
    "#modules/inventory/ (stock_count)",
  ],
};
