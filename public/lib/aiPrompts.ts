/**
 * What the per-screen AI assistant offers to ask, by screen and by business.
 *
 * The server owns what the AI KNOWS (server/modules/ai/domain/); this file only
 * decides which questions are worth suggesting. Keys are the route segment
 * under /app/, identical to the server's MODULES registry.
 */

import { BUSINESS_UIS } from "@/businesses";

export const AI_MODULE_LABEL: Record<string, string> = {
  pos: "Point of sale", sales: "Sales history", products: "Catalog", "stock-in": "Stock in", transfers: "Transfers",
  returns: "Returns", jobs: "Job tickets", suppliers: "Suppliers", "stock-count": "Stock counts", customers: "Customers",
  expenses: "Expenses", staff: "Staff", attendance: "Attendance", activity: "My activity", settings: "Settings",
  audit: "Audit log", tickets: "Support",
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
  suppliers: ["Which suppliers do we rely on most?", "Are any suppliers going quiet?"],
  "stock-count": ["Where are the biggest stock differences?", "Is a stock count overdue?"],
  customers: ["Who are my best customers?", "Which customers have gone quiet?", "Who owes me money?"],
  expenses: ["Where is most of the money going?", "Are expenses too high compared with sales?", "Is anything unusual this month?"],
  staff: ["Who's performing best and who may need help?", "Is anyone voiding or discounting a lot?"],
  attendance: ["Who is in today?", "Who's worked the most hours this week?"],
  activity: ["How have I done this week?", "How did today go so far?"],
  settings: ["What should I turn on for my kind of business?", "Explain my alert settings"],
  audit: ["Was anything sensitive done this week?", "Who has been most active in the system?"],
  tickets: ["Which tickets need attention first?", "What are customers complaining about most?"],
  dashboard: ["How did we do today compared to yesterday?", "What's our biggest risk right now?", "What should I do this week?"],
  "ask-ai": ["How did we do today compared to yesterday?", "What's our biggest risk right now?", "What should I focus on this week?"],
  home: ["How am I doing today?", "What's running low that I should know about?", "What should I do first this shift?"],
};

/**
 * What each installed business adds: its own screens (label + opening
 * questions) and extra opening questions for the platform's screens. Both come
 * from the business's own UI definition (public/businesses/<key>/ui.ts).
 */
for (const ui of BUSINESS_UIS) {
  for (const [screen, { label, prompts }] of Object.entries(ui.ai?.screens ?? {})) {
    AI_MODULE_LABEL[screen] = label;
    BY_MODULE[screen] = prompts;
  }
}
const BY_TRADE: Record<string, Record<string, string[]>> = Object.fromEntries(
  BUSINESS_UIS.filter((ui) => ui.ai?.prompts).map((ui) => [ui.key, ui.ai!.prompts!])
);

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
