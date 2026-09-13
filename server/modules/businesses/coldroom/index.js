/**
 * Cold Room (Frozen Fish) — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): coldChain, weighing, credit.
 *
 * The distinctive fact this module exists for: a purchased carton is not a
 * fixed quantity of stock. It legitimately becomes THREE different sellable
 * units — carton, kg, piece — with a real, non-fixed weight loss (ice glaze,
 * dehydration during storage) in between that only becomes a known number
 * once the carton is opened and weighed. A system that hardcodes
 * "1 carton = 20kg" is wrong within the first delivery.
 *
 *   batch.model.js       → the cost-basis FIFO queue. cartonsReceived,
 *                          packSizeKg and unitCostPerCarton all belong to the
 *                          SPECIFIC purchase, never the product globally —
 *                          the same species can arrive at a different carton
 *                          weight from a different supplier next week.
 *   breakdown.model.js   → carton → kg/piece, the moment shrinkage becomes a
 *                          logged number instead of an assumption.
 *   coldroom.service.js  → FIFO consumption across open batches, and the
 *                          carton-equivalent reconciliation back onto the
 *                          generic Product/Inventory ledger (so Products,
 *                          the Dashboard and low-stock alerts keep working
 *                          exactly like they do for every other trade).
 *   coldroom.routes.js   → purchase, breakdown, retail sale (carton,
 *                          fraction-of-carton, kg or piece), cold-chain loss
 *                          (one batch or the whole room at once), and the
 *                          stock/summary reads the Cold Room page is built
 *                          from.
 *
 * "credit" (a fish seller's regulars routinely buy on trust) is handled by
 * shared infrastructure this module reaches into rather than owning: see
 * server/modules/customers/customerLedger.model.js for the debtor ledger a
 * credit sale posts to, and coldroom.routes.js's /sales for where that
 * happens.
 */
export const COLDROOM_COMPOSITION = {
  capabilities: ["coldChain", "weighing", "credit"],
  implementedIn: ["./coldroom.routes.js", "./coldroom.service.js", "./batch.model.js", "./breakdown.model.js"],
};
