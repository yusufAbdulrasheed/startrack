/**
 * What the per-screen AI assistant offers to ask, by screen and by trade.
 *
 * The server owns what the AI KNOWS (server/modules/ai/domain/); this file only
 * decides which questions are worth suggesting. Keys are the route segment
 * under /app/, identical to the server's MODULES registry.
 */

export const AI_MODULE_LABEL: Record<string, string> = {
  pos: "Point of sale", sales: "Sales history", products: "Catalog", "stock-in": "Stock in", transfers: "Transfers",
  returns: "Returns", jobs: "Job tickets", members: "Members", serials: "Serial numbers", production: "Production",
  vaccinations: "Vaccination & medication", suppliers: "Suppliers", "stock-count": "Stock counts", cohorts: "Batches",
  kitchen: "Kitchen queue", "front-desk": "Front desk", "cold-room": "Cold room", customers: "Customers",
  expenses: "Expenses", staff: "Staff", attendance: "Attendance", activity: "My activity", settings: "Settings",
  audit: "Audit log", tickets: "Support", academy: "Academy", appointments: "Appointments", projects: "Projects",
  dashboard: "Dashboard", "ask-ai": "Whole business", home: "Whole business",
};

const BY_MODULE: Record<string, string[]> = {
  pos: ["What's selling fastest this week?", "Which items might run out today?", "What should I suggest to customers right now?"],
  sales: ["How did this week compare, and when are we busiest?", "Are discounts or voids unusually high?", "How are payments split between cash, POS and transfer?"],
  products: ["Which products have the weakest margins?", "What isn't selling and is tying up money?", "What's expiring soon?"],
  "stock-in": ["What should I buy next, and how much?", "Which supplier have I bought most from?", "What's running low right now?"],
  transfers: ["Is any branch short while another has plenty?", "What moved between branches recently?"],
  returns: ["Why are items coming back?", "Which returns have waited longest?", "Which product is returned most?"],
  jobs: ["Which jobs are late?", "Who should I call to collect their finished item?", "How much is still to collect on open jobs?"],
  members: ["Whose membership is about to expire?", "Which lapsed members should I win back?", "When is the gym busiest?"],
  serials: ["Which warranties end soon?", "Which models are down to the last few units?"],
  production: ["How is our leakage trend?", "Are we using raw materials faster than usual?", "Will we have enough finished stock for demand?"],
  vaccinations: ["What's overdue?", "What's due in the next two weeks?"],
  suppliers: ["Which suppliers do we rely on most?", "Are any suppliers going quiet?"],
  "stock-count": ["Where are the biggest stock differences?", "Is a stock count overdue?"],
  cohorts: ["Is any batch's mortality worrying?", "Which batch is ready to harvest?", "How much feed is each batch using?"],
  kitchen: ["What has been waiting longest?", "Is the kitchen backing up?"],
  "front-desk": ["How full are we tonight and this week?", "Which guests owe money on their folio?", "What's blocking rooms from being sold?"],
  "cold-room": ["How bad is our shrinkage?", "Which batch should I sell first?", "Who owes us the most on credit?"],
  customers: ["Who are my best customers?", "Which customers have gone quiet?", "Who owes me money?"],
  expenses: ["Where is most of the money going?", "Are expenses too high compared with sales?", "Is anything unusual this month?"],
  staff: ["Who's performing best and who may need help?", "Is anyone voiding or discounting a lot?"],
  attendance: ["Who is in today?", "Who's worked the most hours this week?"],
  activity: ["How have I done this week?", "How did today go so far?"],
  settings: ["What should I turn on for my kind of business?", "Explain my alert settings"],
  audit: ["Was anything sensitive done this week?", "Who has been most active in the system?"],
  tickets: ["Which tickets need attention first?", "What are customers complaining about most?"],
  academy: ["Who owes tuition, and how much?", "Which classes have empty seats?", "Which course earns the most?", "How is attendance and are students dropping off?"],
  appointments: ["What does today look like and where are the gaps?", "How bad is our no-show rate?", "Which services earn the most?", "Who are my repeat clients?"],
  projects: ["What can I invoice right now?", "Which milestones or projects are late?", "Which project is burning hours for too little pay?", "How healthy is my pipeline?"],
  dashboard: ["How did we do today compared to yesterday?", "What's our biggest risk right now?", "What should I do this week?"],
  "ask-ai": ["How did we do today compared to yesterday?", "What's our biggest risk right now?", "What should I focus on this week?"],
  home: ["How am I doing today?", "What's running low that I should know about?", "What should I do first this shift?"],
};

/**
 * Extra opening questions only a given trade would ask of a given screen —
 * a hotel's dashboard question is about occupancy, a school's about fees.
 */
const BY_TRADE: Record<string, Record<string, string[]>> = {
  hotel: {
    dashboard: ["What's tonight's occupancy and who checks out today?", "Which open folios have the biggest unpaid balance?"],
    "ask-ai": ["What's our occupancy this week?", "Which guests owe money?"],
  },
  academy: {
    dashboard: ["How much tuition is still owed?", "Which class needs more students?"],
    "ask-ai": ["Who owes tuition?", "Which class has the most empty seats?"],
    customers: ["Which students owe tuition?", "Which students haven't been active lately?"],
    expenses: ["How do tutor and running costs compare with tuition income?"],
  },
  salon: {
    dashboard: ["What does today's schedule look like?", "How is our no-show rate?"],
    "ask-ai": ["Which stylist is busiest this week?", "Are clients coming back?"],
    customers: ["Which clients haven't visited in a while?"],
  },
  agency: {
    dashboard: ["How much work is delivered but unpaid?", "Which projects are late?"],
    "ask-ai": ["What can I invoice now?", "Which client brings the most money?"],
    customers: ["Which clients owe us for delivered work?"],
  },
  poultry: {
    dashboard: ["Is any flock's mortality worrying?", "Is any vaccination overdue?"],
    "ask-ai": ["How are the flocks doing?", "What's due for vaccination?"],
  },
  coldroom: {
    dashboard: ["How much are we losing to shrinkage?", "Who owes us the most on credit?"],
    "ask-ai": ["Which batch should we sell first?", "What's our shrinkage trend?"],
  },
  water: {
    dashboard: ["What is our leakage rate?", "Do we have enough raw materials for this week?"],
    "ask-ai": ["Is production efficient?", "Which customers owe us?"],
  },
  restaurant: {
    dashboard: ["Which dishes make the most money?", "Which ingredients will run out first?"],
    "ask-ai": ["Is the kitchen keeping up?", "What's our waste like?"],
  },
  gym: {
    dashboard: ["Whose membership expires this week?", "How many members are active?"],
    "ask-ai": ["How is member retention?", "When are we busiest?"],
  },
  electronics: {
    dashboard: ["Which repairs are overdue?", "Which warranties end soon?"],
  },
  blinds: {
    dashboard: ["Which jobs are past their promised date?", "Which fabrics are running low?"],
  },
  laundry: {
    dashboard: ["Which tickets are ready but uncollected?", "How is turnaround time?"],
  },
  supermarket: {
    dashboard: ["Which best-sellers are about to run out?", "What should I discount before it expires?"],
  },
};

/** The route segment under /app/, or "" when not inside the app. */
export function moduleFromPath(pathname: string): string {
  const m = pathname.match(/^\/app\/([^/?#]+)/);
  return m ? m[1] : "dashboard";
}

// Screens where a downloadable report makes sense, with the prompt that asks
// for it. The server turns the wording into the right report (see
// server/modules/reports/reportTool.js).
const REPORT_PROMPT: Record<string, string> = {
  dashboard: "Download a sales report for the last 30 days",
  "ask-ai": "Download a sales report for the last 30 days",
  home: "Download a sales report for the last 30 days",
  sales: "Export all transactions from the last 30 days to Excel",
  products: "Export my stock as an Excel file",
  "stock-in": "Export my stock as an Excel file",
  customers: "Make a customers report as a PDF",
  expenses: "Download this month's expenses as a PDF",
  staff: "Generate a staff performance report",
};

export function suggestionsFor(module: string, typeKey?: string): string[] {
  const tradeSpecific = (typeKey && BY_TRADE[typeKey]?.[module]) || [];
  const general = BY_MODULE[module] || BY_MODULE["ask-ai"];
  const questions = [...tradeSpecific, ...general];
  const report = REPORT_PROMPT[module];
  // Always leave room for the one question every new user has.
  return [...questions.slice(0, report ? 2 : 3), ...(report ? [report] : []), "How do I use this screen?"];
}

export function moduleLabel(module: string): string {
  return AI_MODULE_LABEL[module] || "Whole business";
}
