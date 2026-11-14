/**
 * Supermarket / Mini-Mart — the plain-retail business.
 *
 * It registers no structural capability: shelf goods, a till, suppliers and
 * stock counts are exactly what the platform already runs. This manifest is all
 * the "service" it needs.
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "supermarket",
  label: "Supermarket / Mini-Mart",
  terminology: { products: "Products" },
  posLabel: "Point of Sale",
  defaultCategories: ["Groceries", "Beverages", "Household", "Personal Care", "Snacks", "Frozen"],
  modules: ["returns", "transfers", "customers", "expenses", "attendance", "suppliers", "stock_count"],
  tagline: "Everyday FMCG, priced and counted right",
  capabilities: [],
  skuPrefix: "SUP",
  nav: [],
};
