/**
 * Water Factory / Table Water — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): production, credit, loyalty.
 *
 *   production (capability) → server/modules/production/ (ProductionRun
 *     model + routes) consuming server/modules/products/product.model.js's
 *     `bom` (with per-line `includeLeakage`) and `producedUnitsPerStockUnit`
 *     — a batch run deducts raw materials and credits finished stock via
 *     the one stock ledger (applyMovement), exactly like every other
 *     production-capable trade (bakery, furniture, printing). Forking a
 *     water-only copy of this engine would create a second implementation
 *     for those other trades to drift out of sync with — the exact
 *     regression this reorganization's shared-core decision was written to
 *     avoid, so it deliberately stays in the shared module, not here.
 *   loyalty (capability) → loyalty.routes.js (this directory) — reward
 *     tokens from sachet/bag purchases (running counters on Customer,
 *     mirroring the already-established totalSpend/visits pattern) plus a
 *     recurring supply schedule. Genuinely water-specific: no other trade
 *     declares this capability today.
 *   credit (capability) → generic customer-credit terms, handled wherever a
 *     sale/customer balance is recorded (server/modules/customers/,
 *     server/modules/sales/sales.routes.js) — not a water-specific concept.
 */
export const WATER_COMPOSITION = {
  capabilities: ["production", "credit", "loyalty"],
  implementedIn: [
    "#modules/production/production.routes.js",
    "#modules/production/productionRun.model.js",
    "#modules/products/product.model.js (bom, producedUnitsPerStockUnit)",
    "./loyalty.routes.js (loyalty)",
    "#modules/customers/ + #modules/sales/sales.routes.js (credit)",
  ],
};
