/**
 * Water Factory / Table Water.
 *
 * This business's own: PRODUCTION RUNS (raw materials in, finished packs out,
 * with the leakage in between measured) and LOYALTY TOKENS (sachet and bag
 * purchases earn a free pack). Customer credit comes from the platform.
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "water",
  label: "Water Factory / Table Water",
  terminology: { products: "Products & Materials" },
  posLabel: "Sales Point",
  defaultCategories: ["Raw Materials", "Sachets", "Bottles", "Dispensers"],
  modules: ["returns", "transfers", "customers", "expenses", "attendance"],
  tagline: "Raw materials in, pure water out — and the yield in between",
  capabilities: ["production", "credit", "loyalty"],
  capabilityInfo: {
    production: { label: "Production runs", hint: "Consume raw materials, yield finished goods, measure the waste between" },
    loyalty: { label: "Loyalty tokens", hint: "Reward tokens from repeat purchases, redeemable for free packs" },
  },
  skuPrefix: "WAT",
  // Every unit a bottling/sachet line actually sells or buys in. No "bird"
  // — that is Poultry's concern, not this business's.
  allowedUnits: ["pack", "bag", "crate", "bottle", "unit"],
  nav: [
    { group: "inventory", to: "/app/production", label: "Production", perm: "stock", feature: "verticals" },
  ],
};
