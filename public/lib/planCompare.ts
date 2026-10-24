import { planAllows } from "#shared/plans.js";

/** Every feature, grouped the way an owner thinks about them, for the comparison tables on the billing and landing pages. */
export const COMPARE: { title: string; rows: { label: string; free: string | boolean; pro: string | boolean; business: string | boolean }[] }[] = [
  {
    title: "Everyday selling",
    rows: [
      { label: "Point of sale & sales history", free: true, pro: true, business: true },
      { label: "Products", free: "Up to 50", pro: "Up to 2,000", business: "Unlimited" },
      { label: "Customers & expenses", free: true, pro: true, business: true },
      { label: "Stock in & basic inventory", free: true, pro: true, business: true },
      { label: "Dashboard", free: "Overview, Sales, Expenses", pro: "Full", business: "Full" },
    ],
  },
  {
    title: "Team & locations",
    rows: [
      { label: "Staff accounts", free: "2", pro: "10", business: "Unlimited" },
      { label: "Branches", free: "1", pro: "3", business: "Unlimited" },
      { label: "Businesses", free: "1", pro: "1", business: "Unlimited" },
      { label: "All-stores dashboard", free: false, pro: false, business: true },
    ],
  },
  {
    title: "Smarter stock",
    rows: ([
      ["barcodes", "Barcodes & label printing"], ["expiry", "Expiry tracking"], ["transfers", "Branch transfers"],
      ["suppliers", "Suppliers"], ["stockCount", "Stock counts"], ["returns", "Returns & refunds"], ["csvImport", "Bulk product import"], ["productPhotos", "Product photos"],
    ] as const).map(([k, label]) => ({ label, free: planAllows("free", k), pro: planAllows("pro", k), business: planAllows("business", k) })),
  },
  {
    title: "AI",
    rows: [
      { label: "AI assistant & Ask AI", free: false, pro: true, business: true },
      { label: "PDF & Excel reports", free: false, pro: true, business: true },
      { label: "Spreadsheet import, read by AI", free: false, pro: true, business: true },
      { label: "AI receipt writer", free: false, pro: false, business: true },
    ],
  },
  {
    title: "Growth & brand",
    rows: [
      { label: "Loyalty cards", free: false, pro: true, business: true },
      { label: "Trade-specific tools", free: false, pro: true, business: true },
      { label: "Custom receipt (no template)", free: false, pro: true, business: true },
      { label: "Receipt templates", free: false, pro: false, business: true },
      { label: "Your business landing page", free: false, pro: false, business: true },
      { label: "Audit log", free: false, pro: false, business: true },
    ],
  },
];

