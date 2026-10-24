import { REPORT_KINDS, ALLOWED_DAYS, canBuild, clampDays } from "#modules/reports/reportData.js";

/**
 * How the AI offers a report. Unlike the action tools (aiActions.service.js),
 * this one writes nothing and needs no approval — it only hands the person a
 * link to a file. The numbers inside are never the model's: the file is built
 * from the database at the moment of download (reports.routes.js), by the same
 * builders the dashboard uses.
 */

// Any mention of a report-ish word attaches the tool (it costs a few hundred
// tokens, so a plain question about the numbers doesn't pay for it).
export const REPORT_WORDS = /\b(reports?|export|download|pdf|excel|xlsx|spreadsheet|statement|printable|print out)\b/i;

// Stronger signals the person really wants a file. Used for the fallback below,
// where the server attaches a report even if the model only answered in text.
const WANTS_FILE =
  /\b(pdf|excel|xlsx|spreadsheet|export)\b|\b(generate|create|make|prepare|produce|build|download|print|give me|get me|send me|show me|i need|i want|i'd like|can i (?:get|have)|can you (?:give|send|make|prepare))\b[^.?!]{0,50}\b(reports?|statement)\b|\b(reports?)\b[^.?!]{0,20}\b(please|pls)\b/i;

export const wantsFile = (q) => WANTS_FILE.test(q);

export function reportTool(ctx) {
  const kinds = Object.entries(REPORT_KINDS).filter(([k]) => canBuild(ctx, k));
  if (!kinds.length) return null;
  return {
    type: "function",
    function: {
      name: "generate_report",
      description:
        "Give the person a downloadable PDF and Excel report built from their live business data. Call this whenever they ask for a report, export, spreadsheet, PDF, Excel file or printable summary. " +
        "Do not write figures yourself — the file is generated from the database. Kinds: " +
        kinds.map(([k, v]) => `${k} (${v.blurb})`).join("; ") + ".",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: kinds.map(([k]) => k), description: "Which report" },
          days: { type: "integer", enum: ALLOWED_DAYS, description: "Period in days for sales, transactions and expenses reports (1 = today). Default 30." },
        },
        required: ["kind"],
      },
    },
  };
}

// Turns a validated request into what the chat shows: a titled card with
// download buttons. The title says what period the file will cover.
export function describeReport(kind, days) {
  const spec = REPORT_KINDS[kind];
  const d = spec.days ? (kind === "sales" ? Math.max(clampDays(days), 7) : clampDays(days)) : null;
  const period = d === null ? "" : d === 1 ? " · today" : ` · last ${d} days`;
  return { kind, days: d, title: `${spec.label}${period}`, blurb: spec.blurb, formats: ["pdf", "xlsx"] };
}

export function resolveReportCall(ctx, args = {}) {
  const kind = String(args.kind || "");
  if (!REPORT_KINDS[kind]) return { error: "I don't have a report by that name." };
  if (!canBuild(ctx, kind)) return { error: `You don't have access to the ${REPORT_KINDS[kind].label.toLowerCase()}.` };
  return { report: describeReport(kind, args.days) };
}

// Picks a report from the wording when the model didn't call the tool. Falls
// back to what the person is looking at.
const BY_SCREEN = { products: "inventory", customers: "customers", staff: "staff", expenses: "expenses", sales: "transactions", dashboard: "summary" };

export function inferReport(ctx, question, module = "") {
  const q = question.toLowerCase();
  let kind =
    /expens|spend|spent|cost/.test(q) ? "expenses" :
    /inventor|stock|reorder|expir/.test(q) ? "inventory" :
    /debtor|owe|customer/.test(q) ? "customers" :
    /staff|employee|cashier|team|performance/.test(q) ? "staff" :
    /transaction|receipt|every sale|each sale|sales list/.test(q) ? "transactions" :
    /sale|revenue|income|takings|profit/.test(q) ? "sales" :
    /summary|overview|whole business|everything|health/.test(q) ? "summary" :
    BY_SCREEN[module] || "summary";
  if (!canBuild(ctx, kind)) kind = Object.keys(REPORT_KINDS).find((k) => canBuild(ctx, k));
  if (!kind) return null;

  let days = 30;
  if (/\btoday\b/.test(q)) days = 1;
  else if (/\b(week|7 days|seven days)\b/.test(q)) days = 7;
  else if (/\b(quarter|90 days|3 months|three months|ninety)\b/.test(q)) days = 90;
  else {
    const m = q.match(/(\d+)\s*(day|week|month)/);
    if (m) days = Number(m[1]) * (m[2] === "week" ? 7 : m[2] === "month" ? 30 : 1);
  }
  return describeReport(kind, days);
}
