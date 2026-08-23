// Business type = provisioning template, not code (blueprint §0).
//
// Two different things are configured here, and the distinction matters:
//
//   modules      — things an owner can switch OFF in Settings. Preferences.
//   capabilities — what the trade structurally IS. A hotel has rooms and a
//                  folio; a water factory has production runs; a poultry farm
//                  has flocks that eat. These decide which screens and which
//                  product archetypes exist at all, and are not a preference.
//
// Adding a trade is a data edit. Adding a CAPABILITY is real work, because
// something has to implement it — see server/modules/.

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

/**
 * Structural capabilities. Each one is a primitive the trade cannot work
 * without — the reason a supermarket's software fails a poultry farm.
 */
export const CAPABILITIES = {
  rooms:        { label: "Rooms & availability", hint: "Sell the same room night after night; occupancy is a calendar, not a stock count" },
  folio:        { label: "Open bills (folio)", hint: "Charges accumulate across outlets and settle once at check-out" },
  kitchen:      { label: "Kitchen & orders", hint: "An outlet that posts charges instead of taking cash" },
  production:   { label: "Production runs", hint: "Consume raw materials, yield finished goods, measure the waste between" },
  cohorts:      { label: "Living batches", hint: "Flocks and ponds that eat daily, suffer mortality and are harvested" },
  jobs:         { label: "Job tickets", hint: "Work taken in, worked on over days, collected — with a stage per ticket" },
  serials:      { label: "Serial numbers", hint: "Track each unit individually, with warranty and repair history" },
  variants:     { label: "Variant matrix", hint: "One item, many sizes and colours, each with its own stock" },
  appointments: { label: "Appointments", hint: "Booked time against a person or a chair" },
  weighing:     { label: "Sell by weight", hint: "Price per kg or litre, entered at the scale" },
  meters:       { label: "Meter readings", hint: "Opening and closing readings reconciled against cash taken" },
  memberships:  { label: "Memberships", hint: "Recurring access rather than one-off sales" },
  credit:       { label: "Customer credit", hint: "Supply now, invoice later, chase the balance" },
  lots:         { label: "Batch / lot tracking", hint: "Expiry and recall by batch, not by product" },
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

export const BUSINESS_TYPES = {
  retail: {
    label: "Supermarket / Retail",
    ...T("Products", "Point of Sale",
      ["Grains", "Beverages", "Dairy", "Household", "Toiletries"],
      [...COMMON, "expiry"],
      "Fast lanes, full shelves"),
  },
  pharmacy: {
    label: "Pharmacy",
    ...T("Medicines", "Dispensary",
      ["Prescription", "OTC", "First Aid", "Supplements", "Baby & Mother"],
      [...COMMON, "expiry"],
      "Expiry-aware from day one",
      ["lots"]),
  },
  restaurant: {
    label: "Restaurant / Eatery",
    ...T("Menu Items", "Order Point",
      ["Mains", "Sides", "Drinks", "Desserts"],
      ["customers", "expenses", "attendance"],
      "From order to kitchen",
      ["production", "kitchen", "folio"]),
  },
  fashion: {
    label: "Fashion / Boutique",
    ...T("Items", "Point of Sale",
      ["Men", "Women", "Kids", "Shoes", "Accessories"],
      COMMON,
      "Style, sized and stocked",
      ["variants"]),
  },
  tailoring: {
    label: "Tailoring / Fashion Design",
    ...T("Items & Fabrics", "Point of Sale",
      ["Fabrics", "Sewing Jobs", "Alterations", "Accessories"],
      ["customers", "expenses", "attendance", "made_to_order"],
      "Made-to-measure, from your own recipes",
      ["jobs"]),
  },
  blinds: {
    label: "Window Blinds & Curtains",
    ...T("Blinds & Fabrics", "Point of Sale",
      ["Fabrics", "Tracks & Rails", "Blinds", "Fittings", "Installation"],
      ["returns", "customers", "expenses", "attendance", "made_to_order"],
      "Priced per square metre, cut from your own stock",
      ["jobs"]),
  },
  furniture: {
    label: "Furniture Workshop",
    ...T("Furniture & Materials", "Point of Sale",
      ["Timber", "Foam & Fabric", "Fittings", "Finished Pieces"],
      [...COMMON, "made_to_order"],
      "Built to order, costed to the plank",
      ["jobs", "production"]),
  },
  electronics: {
    label: "Electronics",
    ...T("Products", "Point of Sale",
      ["Phones", "Computers", "Audio & TV", "Accessories", "Repairs"],
      [...COMMON, "made_to_order"],
      "Serial-number-grade care",
      ["serials", "jobs"]),
  },
  hotel: {
    label: "Hotel / Guest House",
    ...T("Services & Items", "Front Desk",
      ["Rooms", "Food & Drinks", "Laundry", "Extras"],
      ["customers", "expenses", "attendance"],
      "Rooms, folios and a kitchen that bills to the room",
      ["rooms", "folio", "kitchen"]),
  },
  salon: {
    label: "Salon / Beauty",
    ...T("Services & Products", "Point of Sale",
      ["Hair", "Nails", "Spa", "Retail Products"],
      ["customers", "expenses", "attendance"],
      "Beauty, booked and billed",
      ["appointments"]),
  },
  bakery: {
    label: "Bakery",
    ...T("Products", "Point of Sale",
      ["Bread", "Cakes", "Pastries", "Drinks"],
      ["returns", "customers", "expenses", "attendance", "expiry"],
      "Fresh out, sold out",
      ["production"]),
  },
  bar: {
    label: "Bar / Lounge",
    ...T("Drinks & Items", "Point of Sale",
      ["Beer", "Spirits", "Wine", "Soft Drinks", "Food"],
      ["transfers", "customers", "expenses", "attendance"],
      "Every bottle accounted for",
      ["folio"]),
  },
  water: {
    label: "Water Factory / Table Water",
    ...T("Products & Materials", "Sales Point",
      ["Raw Materials", "Sachets", "Bottles", "Dispensers"],
      [...COMMON],
      "Raw materials in, pure water out — and the yield in between",
      ["production", "credit"]),
  },
  poultry: {
    label: "Poultry Farm",
    ...T("Stock & Feed", "Sales Point",
      ["Feed", "Birds", "Eggs", "Medication", "Equipment"],
      ["customers", "expenses", "attendance", "expiry"],
      "Feed in, eggs out, and the conversion ratio between",
      ["cohorts", "credit"]),
  },
  fishfarm: {
    label: "Fish Farm",
    ...T("Stock & Feed", "Sales Point",
      ["Feed", "Fingerlings", "Harvest", "Equipment"],
      ["customers", "expenses", "attendance"],
      "Ponds that eat daily and harvest by weight",
      ["cohorts", "weighing"]),
  },
  laundry: {
    label: "Laundry / Dry Cleaning",
    ...T("Services & Items", "Drop-off",
      ["Wash & Fold", "Dry Cleaning", "Ironing", "Specialty"],
      ["customers", "expenses", "attendance"],
      "Tagged in, tracked through, collected on time",
      ["jobs"]),
  },
  autorepair: {
    label: "Auto Repair / Mechanic",
    ...T("Parts & Services", "Workshop",
      ["Engine", "Electrical", "Body", "Tyres", "Labour"],
      [...COMMON],
      "Job cards, parts and labour, per vehicle",
      ["jobs", "credit"]),
  },
  carwash: {
    label: "Car Wash",
    ...T("Services", "Service Point",
      ["Wash", "Detailing", "Interior", "Extras"],
      ["customers", "expenses", "attendance"],
      "Queue in, shine out",
      ["jobs", "memberships"]),
  },
  printing: {
    label: "Printing Press",
    ...T("Jobs & Materials", "Front Desk",
      ["Paper & Board", "Ink", "Print Jobs", "Finishing"],
      [...COMMON, "made_to_order"],
      "Quoted, produced, delivered — costed to the sheet",
      ["jobs", "production", "credit"]),
  },
  buildingmaterials: {
    label: "Building Materials",
    ...T("Materials", "Sales Point",
      ["Cement & Blocks", "Iron & Steel", "Roofing", "Plumbing", "Paint"],
      [...COMMON],
      "Sold by the tonne, delivered, and invoiced",
      ["weighing", "credit"]),
  },
  coldroom: {
    label: "Cold Room / Frozen Foods",
    ...T("Products", "Sales Point",
      ["Chicken", "Fish", "Beef", "Turkey", "Ice"],
      [...COMMON, "expiry"],
      "Priced at the scale, watched at the thermometer",
      ["weighing", "lots"]),
  },
  filling: {
    label: "Filling Station",
    ...T("Fuel & Products", "Forecourt",
      ["PMS", "AGO", "LPG", "Lubricants", "Shop"],
      ["customers", "expenses", "attendance"],
      "Pump readings reconciled against the cash drawer",
      ["meters", "credit"]),
  },
  gym: {
    label: "Gym / Fitness",
    ...T("Plans & Products", "Front Desk",
      ["Memberships", "Personal Training", "Supplements", "Merchandise"],
      ["customers", "expenses", "attendance"],
      "Members in, renewals tracked",
      ["memberships", "appointments"]),
  },
  agro: {
    label: "Farm Produce / Agro",
    ...T("Produce & Inputs", "Sales Point",
      ["Grains", "Tubers", "Vegetables", "Inputs"],
      [...COMMON],
      "Weighed, graded and sold by season",
      ["weighing", "credit"]),
  },
  services: {
    label: "General Services",
    ...T("Services", "Point of Sale",
      ["Services", "Materials"],
      ["customers", "expenses", "attendance"],
      "Work done, work paid",
      ["jobs"]),
  },
  other: {
    label: "General Business",
    ...T("Products", "Point of Sale",
      ["General"],
      ALL_TOGGLEABLE,
      "Everything on, trim later"),
  },
};

export function typeTemplate(typeKey) {
  return BUSINESS_TYPES[typeKey] || BUSINESS_TYPES.other;
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
