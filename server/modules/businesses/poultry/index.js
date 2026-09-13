/**
 * Poultry Farm — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): cohorts, credit, medication.
 *
 *   cohorts    → cohort.model.js, cohorts.routes.js (this directory) — a
 *                flock/batch that's fed (via the ordinary stock ledger,
 *                exactly like a Production Run's raw-material deduction),
 *                suffers mortality (its own event log — a dead bird was
 *                never Product stock, so it never touches the ledger), and
 *                is harvested (credits a real sellable product's stock,
 *                exactly like a Production Run's finished-goods credit).
 *   medication → vaccination.model.js, vaccinations.routes.js (this
 *                directory, moved from the old top-level vaccinations/) — a
 *                pure dosage log, no stock or money side effects.
 *   credit     → generic customer-credit terms, handled wherever a
 *                sale/customer balance is recorded (server/modules/customers/,
 *                server/modules/sales/sales.routes.js) — not poultry-specific.
 *
 * fishfarm declares the same `cohorts` capability today but has zero other
 * implementation (no fishfarm-specific code exists anywhere). It's out of
 * scope for this pass; cohorts was built to poultry's actual shape (birds,
 * mortality, egg/bird harvest) rather than generalized ahead of a second
 * real consumer — the same "build it once it's real" discipline this
 * codebase already applies to production/jobs/made_to_order.
 */
export const POULTRY_COMPOSITION = {
  capabilities: ["cohorts", "credit", "medication"],
  implementedIn: [
    "./cohort.model.js", "./cohorts.routes.js",
    "./vaccination.model.js", "./vaccinations.routes.js",
    "#modules/customers/ + #modules/sales/sales.routes.js (credit)",
  ],
};
