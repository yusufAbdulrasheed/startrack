/**
 * Training Academy / Tech School.
 *
 * This business's own: COURSES, INTAKES and ENROLMENTS — students enrol, pay
 * fees in instalments and are marked present each class. It sells services (a
 * registration fee, tuition, an exam), not stock, so its catalogue lists
 * services with no stock to count (see `service` below and checkout.js).
 *
 * Plain data, no imports: the browser loads this file too.
 */
export default {
  key: "academy",
  label: "Training Academy / Tech School",
  terminology: { products: "Fees & Services" },
  posLabel: "Fee Desk",
  defaultCategories: ["Tuition", "Registration & Exam Fees", "Certificates", "Workshops & Short Courses", "Consulting"],
  modules: ["customers", "expenses", "attendance"],
  tagline: "Courses, classes and students — with the fees still owed",
  capabilities: ["programs"],
  // What "upload my list" means here: the course list (see imports.js).
  primaryImport: "courses",
  // Where till staff land: the fee desk, not the product till.
  tillHome: "academy",
  capabilityInfo: {
    programs: { label: "Courses & classes", hint: "Courses run as intakes; students enrol, pay fees in instalments and are marked present each session" },
  },
  // What a service business's screens say instead of "product / sale / stock".
  //   item / items   what one catalogue entry is called
  //   saleNoun       what a sale is called at the till
  //   priceLabel     what its price is called
  //   showDuration   offer a duration in minutes
  //   physical       also sells physical goods (keeps the stock tools); false = none
  service: { item: "fee", items: "fees & services", saleNoun: "Receipt", priceLabel: "Fee", showDuration: false, physical: false },
  skuPrefix: "ACA",
  positions: [
    "Director", "Head of Training", "Lead Tutor", "Tutor", "Teaching Assistant",
    "Admissions Officer", "Accountant", "Front Desk",
  ],
  nav: [
    { group: "operations", to: "/app/academy", label: "Academy", perm: "sales", feature: "verticals" },
  ],
};
