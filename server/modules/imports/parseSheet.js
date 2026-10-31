import path from "node:path";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

/**
 * Reads an uploaded spreadsheet into plain rows, tolerating how real business
 * spreadsheets actually look: title rows above the headers, merged banners,
 * blank spacer rows and columns, formulas, rich text, "Total" footer lines,
 * and several sheets of which only one holds the list.
 *
 * Nothing here knows about products or courses — it only turns a file into
 * { headers, rows } for the importer to interpret.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 1000; // one request builds and inserts these; keep it quick on serverless too
const EXTENSIONS = new Set([".xlsx", ".xlsm", ".csv"]);

export class UploadError extends Error {}

// A cell can be a number, string, Date, formula result, rich text, hyperlink or error.
function cellValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result); // formula
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return cellValue(v.text); // hyperlink
    if ("error" in v) return "";
    return "";
  }
  if (typeof v === "string") return v.replace(/ /g, " ").trim();
  return v;
}

const isBlank = (v) => v === "" || v === null || v === undefined;
const isText = (v) => typeof v === "string" && v.length > 0 && Number.isNaN(Number(v.replace(/[,₦$£€\s]/g, "")));

function sheetToTable(ws, maxRows = MAX_ROWS) {
  const width = ws.actualColumnCount || ws.columnCount || 0;
  const raw = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const cells = [];
    for (let c = 1; c <= width; c++) cells.push(cellValue(row.getCell(c).value));
    raw.push(cells);
  });

  // The header row is the first one that looks like labels: at least two text
  // cells and mostly text, within the first dozen rows.
  let headerAt = -1;
  for (let i = 0; i < Math.min(raw.length, 12); i++) {
    const filled = raw[i].filter((v) => !isBlank(v));
    const texts = filled.filter(isText);
    if (texts.length >= 2 && texts.length >= filled.length * 0.7) { headerAt = i; break; }
  }
  if (headerAt < 0) return { headers: [], rows: [], total: 0, truncated: false };

  // Name each used column; keep duplicates distinct ("Price", "Price (2)").
  const seen = new Map();
  const cols = [];
  raw[headerAt].forEach((h, idx) => {
    if (isBlank(h)) return;
    let label = String(h).replace(/\s+/g, " ").trim();
    const n = (seen.get(label.toLowerCase()) || 0) + 1;
    seen.set(label.toLowerCase(), n);
    if (n > 1) label = `${label} (${n})`;
    cols.push({ idx, label });
  });

  const rows = [];
  let total = 0;
  for (let i = headerAt + 1; i < raw.length; i++) {
    const r = raw[i];
    if (r.every(isBlank)) continue;
    const first = r.find((v) => !isBlank(v));
    // Footer lines like "Total" / "Grand total" aren't items.
    if (typeof first === "string" && /^(grand\s+)?total\b/i.test(first) && r.filter((v) => !isBlank(v)).length <= 3) continue;
    total++;
    if (rows.length >= maxRows) continue;
    const obj = {};
    for (const c of cols) obj[c.label] = r[c.idx] ?? "";
    obj.__row = i + 1; // the row number as Excel shows it
    rows.push(obj);
  }
  return { headers: cols.map((c) => c.label), rows, total, truncated: total > rows.length };
}

export async function parseUpload(buffer, fileName, { maxRows = MAX_ROWS } = {}) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".xls") throw new UploadError("That's an old .xls file. Open it in Excel and choose Save As → Excel Workbook (.xlsx), or save it as CSV, then upload it again.");
  if (!EXTENSIONS.has(ext)) throw new UploadError("I can read Excel (.xlsx) and CSV (.csv) files.");
  if (!buffer?.length) throw new UploadError("That file is empty.");
  if (buffer.length > MAX_FILE_BYTES) throw new UploadError("That file is over 5 MB. Split it into smaller files and upload them one at a time.");

  const wb = new ExcelJS.Workbook();
  try {
    // No automatic date conversion: the CSV reader would otherwise read 05-03-2025 as
    // May 3rd (month first) and shift dates by the server's timezone. Dates stay text
    // here and are read day-first, the way these spreadsheets are written, by parseDate().
    if (ext === ".csv") await wb.csv.read(Readable.from(buffer), { dateFormats: [] });
    else await wb.xlsx.load(buffer);
  } catch {
    throw new UploadError("I couldn't open that file — it may be damaged or password-protected.");
  }

  const tables = wb.worksheets
    .filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden")
    .map((ws) => ({ name: ext === ".csv" ? "CSV" : ws.name, ...sheetToTable(ws, maxRows) }))
    .filter((t) => t.headers.length && t.total > 0);
  if (!tables.length) throw new UploadError("I couldn't find a table in that file. It needs a header row (Name, Price…) with items underneath.");

  // Every usable sheet is returned, biggest first. Which one holds the list is
  // decided by the importer, by how well each sheet's columns fit the catalog
  // — a "Notes" or "How to fill this in" sheet can be longer than the data.
  tables.sort((a, b) => b.total - a.total);
  return { fileName, tables };
}
