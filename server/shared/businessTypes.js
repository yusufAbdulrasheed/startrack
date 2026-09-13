
export const TOGGLEABLE_MODULES = [
  { key: "returns", label: "Returns", hint: "Customer returns with manager approval" },
  { key: "transfers", label: "Branch transfers", hint: "Move stock between branches" },
  { key: "customers", label: "Customers", hint: "Track who buys and how much" },
  { key: "expenses", label: "Expenses", hint: "Record spending against profit" },
  { key: "attendance", label: "Attendance", hint: "Staff clock in / clock out" },
  { key: "expiry", label: "Expiry tracking", hint: "Expiry dates and expiring-soon alerts" },
  { key: "made_to_order", label: "Made-to-order items", hint: "Blinds, curtains, tailoring — items built from components you configure" },
  { key: "suppliers", label: "Suppliers", hint: "Track who you buy from and what they charge" },
  { key: "stock_count", label: "Stock counts", hint: "Periodic physical counts reconciled against the system" },
];

export const ALL_TOGGLEABLE = TOGGLEABLE_MODULES.map((m) => m.key);

/**
 * Structural capabilities. Each one is a primitive the trade cannot work
 * without — the reason a supermarket's software fails a poultry farm.
 */
export const CAPABILITIES = {
  rooms:        { label: "Rooms & availability", hint: "Sell the same room night after night; occupancy is a calendar, not a stock count" },
  folio:        { label: "Open bills (folio)", hint: "Charges accumulate across outlets and settle once at check-out" },
  kitchen:      { label: "Kitchen & orders", hint: "An outlet that posts charges instead of taking cash" },
  kitchenQueue: { label: "Kitchen order queue", hint: "Sale items routed to the kitchen with a prep status per line" },
  production:   { label: "Production runs", hint: "Consume raw materials, yield finished goods, measure the waste between" },
  cohorts:      { label: "Living batches", hint: "Flocks and ponds that eat daily, suffer mortality and are harvested" },
  jobs:         { label: "Job tickets", hint: "Work taken in, worked on over days, collected — with a stage per ticket" },
  serials:      { label: "Serial numbers", hint: "Track each unit individually, with warranty and repair history" },
  medication:   { label: "Vaccination & medication log", hint: "Dosage records for a flock or batch, with next-due tracking" },
  variants:     { label: "Variant matrix", hint: "One item, many sizes and colours, each with its own stock" },
  appointments: { label: "Appointments", hint: "Booked time against a person or a chair" },
  weighing:     { label: "Sell by weight", hint: "Price per kg or litre, entered at the scale" },
  meters:       { label: "Meter readings", hint: "Opening and closing readings reconciled against cash taken" },
  memberships:  { label: "Memberships", hint: "Recurring access rather than one-off sales" },
  credit:       { label: "Customer credit", hint: "Supply now, invoice later, chase the balance" },
  lots:         { label: "Batch / lot tracking", hint: "Expiry and recall by batch, not by product" },
  loyalty:      { label: "Loyalty tokens", hint: "Reward tokens from repeat purchases, redeemable for free packs" },
  coldChain:    { label: "Cold-chain batches", hint: "Cartons that convert into kg and pieces, with the weight loss between them and power-failure loss both tracked explicitly" },
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITIES);

const T = (products, pos, categories, modules, tagline, capabilities = []) => ({
  terminology: { products },
  posLabel: pos,
  defaultCategories: categories,
  modules,
  tagline,
  capabilities,
});

// Every module except the ones a trade genuinely never wants.
const COMMON = ["returns", "transfers", "customers", "expenses", "attendance"];

// Deliberately just these 6 — the trades this platform actually has real,
// deeply-built logic for (see server/modules/businesses/). Re-adding a
// trade later is a data edit (a new entry here); it does not need any of
// the shared core (auth/staff/POS/inventory ledger) to change.
export const BUSINESS_TYPES = {
  restaurant: {
    label: "Restaurant / Eatery",
    ...T("Menu Items", "Order Point",
      ["Mains", "Sides", "Drinks", "Desserts", "Raw Materials"],
      ["customers", "expenses", "attendance", "made_to_order", "suppliers", "stock_count"],
      "From order to kitchen",
      ["production", "kitchenQueue", "folio"]),
    skuPrefix: "RES",
  },
  blinds: {
    label: "Window Blinds & Curtains",
    ...T("Blinds & Fabrics", "Point of Sale",
      ["Fabrics", "Tracks & Rails", "Blinds", "Fittings", "Installation"],
      ["returns", "customers", "expenses", "attendance", "made_to_order"],
      "Priced per square metre, cut from your own stock",
      ["jobs"]),
    skuPrefix: "BLI",
  },
  electronics: {
    label: "Electronics",
    ...T("Products", "Point of Sale",
      ["Phones", "Computers", "Audio & TV", "Accessories", "Repairs"],
      [...COMMON, "made_to_order"],
      "Serial-number-grade care",
      ["serials", "jobs"]),
    skuPrefix: "ELE",
  },
  hotel: {
    label: "Hotel / Guest House",
    ...T("Services & Items", "Front Desk",
      ["Rooms", "Food & Drinks", "Laundry", "Extras"],
      ["customers", "expenses", "attendance"],
      "Rooms, folios and a kitchen that bills to the room",
      ["rooms", "folio", "kitchen"]),
    skuPrefix: "HOT",
    // Suggested job titles for the Staff "Position" field, in the order a
    // real hotel org chart reads top to bottom (MD/CEO down to Cleaner).
    // Purely organizational — see membership.position/reportsToId — this
    // has no bearing on the owner/admin/manager/staff security role.
    positions: [
      "MD/CEO", "General Manager", "Hotel Manager", "Operations Manager",
      "Head Chef", "HOD", "Accountant", "Store Keeper", "Auditor", "Cashier",
      "Purchaser", "Departmental Supervisor", "Room Steward", "Receptionist",
      "Cook", "Waiter/Waitress", "Kitchen Assistant", "Security Guard", "Cleaner",
    ],
  },
  water: {
    label: "Water Factory / Table Water",
    ...T("Products & Materials", "Sales Point",
      ["Raw Materials", "Sachets", "Bottles", "Dispensers"],
      [...COMMON],
      "Raw materials in, pure water out — and the yield in between",
      ["production", "credit", "loyalty"]),
    skuPrefix: "WAT",
    // Every unit a bottling/sachet line actually sells or buys in. No "bird"
    // — that's Poultry's concern, not this trade's.
    allowedUnits: ["pack", "bag", "crate", "bottle", "unit"],
  },
  poultry: {
    label: "Poultry Farm",
    ...T("Stock & Feed", "Sales Point",
      ["Feed", "Birds", "Eggs", "Medication", "Equipment"],
      ["customers", "expenses", "attendance", "expiry"],
      "Feed in, eggs out, and the conversion ratio between",
      ["cohorts", "credit", "medication"]),
    skuPrefix: "POU",
    // No "pack" or "bottle" — a farm doesn't sell either. "bird" additionally
    // requires category "layer" or "broiler" (enforced in products.routes.js)
    // so live layer birds and broilers stay distinguishable.
    allowedUnits: ["crate", "unit", "bag", "bird"],
  },
  coldroom: {
    label: "Cold Room (Frozen Fish)",
    ...T("Fish & Frozen Stock", "Sales Point",
      ["Titus/Mackerel", "Panla", "Croaker", "Catfish", "Tilapia", "Stockfish", "Chicken & Turkey", "Prawns & Seafood", "Other Frozen"],
      ["customers", "expenses", "attendance", "suppliers", "stock_count"],
      "Cartons in, kilograms and pieces out — with the cold chain and the shrinkage between them tracked honestly",
      ["coldChain", "weighing", "credit"]),
    skuPrefix: "CLD",
    // A carton is never a fixed weight (see the coldChain capability) — the
    // three units this trade genuinely sells in, nothing else.
    allowedUnits: ["carton", "kg", "piece"],
  },
};

// The fallback for a typeKey that isn't one of the 6 above — a legacy
// business, or a key that simply doesn't exist. Not itself a selectable
// business type (it never appears in BUSINESS_TYPES, so no picker lists
// it), just a safe, generic default so typeTemplate() never returns
// undefined.
const DEFAULT_TEMPLATE = {
  label: "General Business",
  ...T("Products", "Point of Sale", ["General"], ALL_TOGGLEABLE, "Everything on, trim later"),
};

export function typeTemplate(typeKey) {
  return BUSINESS_TYPES[typeKey] || DEFAULT_TEMPLATE;
}

/** Does this business's trade support a given structural capability? */
export function hasCapability(typeKey, capability) {
  return (typeTemplate(typeKey).capabilities || []).includes(capability);
}

/** Every trade that needs a given capability — used to scope new modules. */
export function typesWithCapability(capability) {
  return Object.entries(BUSINESS_TYPES)
    .filter(([, t]) => (t.capabilities || []).includes(capability))
    .map(([key]) => key);
}
