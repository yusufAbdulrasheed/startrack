// Business type = provisioning template, not code (blueprint §0).
// Each type shapes terminology, which modules start enabled, and which
// features (like expiry tracking) light up. Owners can still toggle any
// module later in Settings — the type just sets smart defaults.

// Modules a business can switch off. Core modules (pos, products, dashboard,
// staff, settings, activity) are always on — the app is meaningless without them.
export const TOGGLEABLE_MODULES = [
  { key: "returns", label: "Returns", hint: "Customer returns with manager approval" },
  { key: "transfers", label: "Branch transfers", hint: "Move stock between branches" },
  { key: "customers", label: "Customers", hint: "Track who buys and how much" },
  { key: "expenses", label: "Expenses", hint: "Record spending against profit" },
  { key: "attendance", label: "Attendance", hint: "Staff clock in / clock out" },
  { key: "expiry", label: "Expiry tracking", hint: "Expiry dates and expiring-soon alerts" },
  { key: "made_to_order", label: "Made-to-order items", hint: "Blinds, curtains, tailoring — items built from components you configure" },
];

export const ALL_TOGGLEABLE = TOGGLEABLE_MODULES.map((m) => m.key);

const T = (products, pos, categories, modules, tagline) => ({
  terminology: { products },
  posLabel: pos,
  defaultCategories: categories,
  modules,
  tagline,
});

export const BUSINESS_TYPES = {
  retail: {
    label: "Supermarket / Retail",
    ...T("Products", "Point of Sale",
      ["Grains", "Beverages", "Dairy", "Household", "Toiletries"],
      ["returns", "transfers", "customers", "expenses", "attendance", "expiry"],
      "Fast lanes, full shelves"),
  },
  pharmacy: {
    label: "Pharmacy",
    ...T("Medicines", "Dispensary",
      ["Prescription", "OTC", "First Aid", "Supplements", "Baby & Mother"],
      ["returns", "transfers", "customers", "expenses", "attendance", "expiry"],
      "Expiry-aware from day one"),
  },
  restaurant: {
    label: "Restaurant / Eatery",
    ...T("Menu Items", "Order Point",
      ["Mains", "Sides", "Drinks", "Desserts"],
      ["customers", "expenses", "attendance"],
      "From order to kitchen"),
  },
  fashion: {
    label: "Fashion / Boutique",
    ...T("Items", "Point of Sale",
      ["Men", "Women", "Kids", "Shoes", "Accessories"],
      ["returns", "transfers", "customers", "expenses", "attendance"],
      "Style, sized and stocked"),
  },
  tailoring: {
    label: "Tailoring / Fashion Design",
    ...T("Items & Fabrics", "Point of Sale",
      ["Fabrics", "Sewing Jobs", "Alterations", "Accessories"],
      ["customers", "expenses", "attendance", "made_to_order"],
      "Made-to-measure, from your own recipes"),
  },
  electronics: {
    label: "Electronics",
    ...T("Products", "Point of Sale",
      ["Phones", "Computers", "Audio & TV", "Accessories", "Repairs"],
      ["returns", "transfers", "customers", "expenses", "attendance", "made_to_order"],
      "Serial-number-grade care"),
  },
  hotel: {
    label: "Hotel / Guest House",
    ...T("Services & Items", "Front Desk",
      ["Rooms", "Food & Drinks", "Laundry", "Extras"],
      ["customers", "expenses", "attendance"],
      "Rooms & folios arrive in v2 — sell services today"),
  },
  salon: {
    label: "Salon / Beauty",
    ...T("Services & Products", "Point of Sale",
      ["Hair", "Nails", "Spa", "Retail Products"],
      ["customers", "expenses", "attendance"],
      "Beauty, booked and billed"),
  },
  bakery: {
    label: "Bakery",
    ...T("Products", "Point of Sale",
      ["Bread", "Cakes", "Pastries", "Drinks"],
      ["returns", "customers", "expenses", "attendance", "expiry"],
      "Fresh out, sold out"),
  },
  bar: {
    label: "Bar / Lounge",
    ...T("Drinks & Items", "Point of Sale",
      ["Beer", "Spirits", "Wine", "Soft Drinks", "Food"],
      ["transfers", "customers", "expenses", "attendance"],
      "Every bottle accounted for"),
  },
  services: {
    label: "General Services",
    ...T("Services", "Point of Sale",
      ["Services", "Materials"],
      ["customers", "expenses", "attendance"],
      "Work done, work paid"),
  },
  other: {
    label: "General Business",
    ...T("Products", "Point of Sale",
      ["General"],
      ["returns", "transfers", "customers", "expenses", "attendance", "expiry", "made_to_order"],
      "Everything on, trim later"),
  },
};

export function typeTemplate(typeKey) {
  return BUSINESS_TYPES[typeKey] || BUSINESS_TYPES.other;
}
