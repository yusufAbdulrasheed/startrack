/**
 * Electronics.
 *
 * This business's own: SERIAL NUMBERS. Each unit is tracked from stock-in
 * through sale, with a per-product warranty that starts the moment it sells
 * (see serial.model.js, serials.routes.js, checkout.js). Repair history is a
 * Job Ticket (the platform's engine) carrying the unit's serial number.
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "electronics",
  label: "Electronics",
  terminology: { products: "Products" },
  posLabel: "Point of Sale",
  defaultCategories: ["Phones", "Computers", "Audio & TV", "Accessories", "Repairs"],
  modules: ["returns", "transfers", "customers", "expenses", "attendance"],
  tagline: "Serial-number-grade care",
  capabilities: ["serials", "jobs"],
  capabilityInfo: {
    serials: { label: "Serial numbers", hint: "Track each unit individually, with warranty and repair history" },
  },
  skuPrefix: "ELE",
  nav: [
    { group: "inventory", to: "/app/serials", label: "Serial Numbers", perm: "stock", feature: "verticals" },
  ],
};
