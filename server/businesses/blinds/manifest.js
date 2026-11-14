/**
 * Window Blinds & Curtains.
 *
 * What is this business's own: MADE-TO-ORDER items, priced per square metre and
 * cut from the shop's own fabric stock (see checkout.js here, the engine that
 * turns a width x height order into components to consume). It also works
 * through the platform's Job Tickets engine for installations.
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "blinds",
  label: "Window Blinds & Curtains",
  terminology: { products: "Blinds & Fabrics" },
  posLabel: "Point of Sale",
  defaultCategories: ["Fabrics", "Tracks & Rails", "Blinds", "Fittings", "Installation"],
  modules: ["returns", "customers", "expenses", "attendance", "made_to_order"],
  tagline: "Priced per square metre, cut from your own stock",
  // jobs: the platform's Job Tickets engine. madeToOrder: owned here.
  capabilities: ["jobs", "madeToOrder"],
  capabilityInfo: {
    madeToOrder: { label: "Made-to-order items", hint: "Blinds and curtains priced by size and built from components in stock" },
  },
  // A module only this business can switch on.
  ownsModules: [
    { key: "made_to_order", label: "Made-to-order items", hint: "Blinds, curtains, tailoring — items built from components you configure" },
  ],
  skuPrefix: "BLI",
  nav: [],
};
