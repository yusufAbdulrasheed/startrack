/**
 * Poultry Farm.
 *
 * This business's own: LIVING BATCHES (flocks that eat daily, suffer mortality
 * and are harvested into sellable stock) and the VACCINATION & MEDICATION log
 * with next-due tracking. Feed and egg sales are ordinary stock.
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "poultry",
  label: "Poultry Farm",
  terminology: { products: "Stock & Feed" },
  posLabel: "Sales Point",
  defaultCategories: ["Feed", "Birds", "Eggs", "Medication", "Equipment"],
  modules: ["customers", "expenses", "attendance", "expiry"],
  tagline: "Feed in, eggs out, and the conversion ratio between",
  // credit: the platform's customer-credit feature.
  capabilities: ["cohorts", "credit", "medication"],
  capabilityInfo: {
    cohorts: { label: "Living batches", hint: "Flocks and ponds that eat daily, suffer mortality and are harvested" },
    medication: { label: "Vaccination & medication log", hint: "Dosage records for a flock or batch, with next-due tracking" },
  },
  skuPrefix: "POU",
  // No "pack" or "bottle" — a farm doesn't sell either. "bird" additionally
  // requires category "layer" or "broiler" (enforced by the platform's product
  // rules) so live layer birds and broilers stay distinguishable.
  allowedUnits: ["crate", "unit", "bag", "bird"],
  nav: [
    { group: "operations", to: "/app/vaccinations", label: "Vaccination & Medication", perm: "dashboard_ops", feature: "verticals" },
    { group: "inventory", to: "/app/cohorts", label: "Batches", perm: "stock", feature: "verticals" },
  ],
};
