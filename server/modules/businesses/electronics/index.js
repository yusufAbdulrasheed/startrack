/**
 * Electronics — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): serials, jobs.
 *
 *   serials → serial.model.js, serials.routes.js (this directory) — each
 *             unit tracked individually from stock-in through sale, with a
 *             per-product warranty period (Product.warrantyMonths) computed
 *             into Serial.warrantyExpiresAt the moment it's sold.
 *   jobs    → server/modules/jobs/ (shared) — "repair history" is a Job
 *             ticket carrying this unit's serialNo, cross-referenced by
 *             serials.routes.js's lookup route. jobs is deliberately
 *             generic infrastructure shared by 9 trades (tailoring, blinds,
 *             furniture, electronics, laundry, autorepair, carwash,
 *             printing, services) — forking a copy here would mean 9
 *             separate implementations of the same ticket workflow, exactly
 *             what the shared-core decision on this reorganization forbids.
 *
 * Product itself (archetype, bom, tracksSerials, warrantyMonths) is core-
 * shared (server/modules/products/) — used by every business type, not
 * duplicated here. Made-to-order/BOM (electronics' repair kits, if used)
 * is also the shared capability implemented in products/ + sales/.
 */
export const ELECTRONICS_COMPOSITION = {
  capabilities: ["serials", "jobs"],
  implementedIn: ["./serial.model.js", "./serials.routes.js", "#modules/jobs/ (shared)"],
};
