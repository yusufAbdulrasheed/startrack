import { downloadXlsx, S, type Cell, type Sheet } from "./xlsx";

/**
 * The bulk-import workbook.
 *
 * Two decisions worth knowing about:
 *
 * 1. The Products sheet holds headers and empty formatted rows — no example
 *    data. Sample rows in the sheet you type into are the classic import
 *    footgun: people forget to delete them and "Golden Penny Semovita" turns
 *    up in their catalog. The worked example lives on the guide sheet instead.
 *
 * 2. Headers stay machine-readable. The importer lowercases a header and
 *    strips everything that isn't a letter or digit, so "Price * (₦)" still
 *    matches `price` — but "Expiry (YYYY-MM-DD)" would collapse to
 *    `expiryyyyymmdd` and match nothing. Format hints therefore go in the
 *    guide and the cell format, never in the header text.
 */

type Column = {
  header: string;
  width: number;
  style: number;
  required?: boolean;
  what: string;
  ifBlank: string;
};

const columns = (currency: string): Column[] => [
  {
    header: "Name *", width: 34, style: S.CELL, required: true,
    what: "What the product is called. This is what staff search for at the till.",
    ifBlank: "The row is skipped.",
  },
  {
    header: "Category", width: 16, style: S.CELL,
    what: "Used to group products on the till and in reports.",
    ifBlank: 'Set to "General".',
  },
  {
    header: "Barcode", width: 18, style: S.TEXT,
    what: "Scan the item into this cell if you have a scanner. Must be unique.",
    ifBlank: "Left empty — you can add it later, or print your own label.",
  },
  {
    header: `Price * (${currency})`, width: 14, style: S.MONEY, required: true,
    what: "What the customer pays for one unit.",
    ifBlank: "The row is skipped.",
  },
  {
    header: `Cost (${currency})`, width: 14, style: S.MONEY,
    what: "What you paid for one unit. Used for profit — staff never see it.",
    ifBlank: "Treated as 0, so profit will read as the full price until you set it.",
  },
  {
    header: "Reorder Level", width: 15, style: S.INT,
    what: "Warn me when stock falls to this number.",
    ifBlank: "Set to 5.",
  },
  {
    header: "Opening Stock", width: 15, style: S.INT,
    what: "How many you have on the shelf right now, at this branch.",
    ifBlank: "Treated as 0 — the product is created but not in stock.",
  },
  {
    header: "Expiry", width: 14, style: S.TEXT,
    what: "Only for goods that expire. Type it as 2027-01-31.",
    ifBlank: "No expiry tracking for this product.",
  },
];

const EXAMPLE_ROWS = [
  ["Golden Penny Semovita 2kg", "Grains", "6151100017341", "2000", "1500", "10", "50", ""],
  ["Peak Milk 400g", "Dairy", "", "1500", "1100", "15", "24", "2027-01-31"],
  ["Bar Soap", "Toiletries", "", "350", "240", "20", "120", ""],
];

const text = (v: string, s: number = S.DEFAULT): Cell => ({ v, s, type: "text" });

export function downloadProductTemplate({
  businessName,
  currency,
  categories,
  productWord,
  branchName,
}: {
  businessName: string;
  currency: string;
  categories: string[];
  productWord: string;
  branchName: string;
}) {
  const cols = columns(currency);
  const ROWS_READY = 300; // pre-formatted rows to type or paste into

  // ── Sheet 1: the sheet you actually fill in ──────────────────────
  const productRows: Cell[][] = [cols.map((c) => text(c.header, S.HEADER))];
  for (let i = 0; i < ROWS_READY; i++) {
    // Empty but styled, so pasted data lands already formatted and bordered.
    productRows.push(cols.map((c) => ({ v: "", s: c.style })));
  }

  const products: Sheet = {
    name: "Products",
    rows: productRows,
    cols: cols.map((c) => ({ width: c.width })),
    freezeHeader: true,
    autoFilterCols: cols.length,
    rowHeights: { 1: 26 },
    // The shop's own categories become a dropdown — no typos, no invented
    // categories, and it makes the file feel like theirs rather than generic.
    validation: categories.length ? { col: 1, values: categories, lastRow: ROWS_READY + 1 } : undefined,
  };

  // ── Sheet 2: what every column means ─────────────────────────────
  const guide: Cell[][] = [
    [text(`${businessName} — ${productWord} import`, S.TITLE)],
    [text(`Fill in the "Products" tab, save the file, then upload it in StarTrack → ${productWord} → Import.`, S.MUTED)],
    [],
    [text("The short version", S.BOLD)],
    [text("1.  Type or paste your items under the headings on the Products tab. One item per row.", S.MUTED)],
    [text("2.  Only Name and Price have to be filled in. Everything else has a sensible default.", S.MUTED)],
    [text("3.  Save the file, then upload it. Nothing is imported until you confirm the preview.", S.MUTED)],
    [],
    [text("What each column means", S.BOLD)],
    [text("Column", S.HEADER), text("Required", S.HEADER), text("What it is", S.HEADER), text("If you leave it blank", S.HEADER)],
    ...cols.map((c) => [
      text(c.header, S.CELL),
      text(c.required ? "Yes" : "No", S.CELL),
      text(c.what, S.CELL),
      text(c.ifBlank, S.CELL),
    ]),
    [],
    [text("A worked example", S.BOLD)],
    [text("Copy the shape of these rows — don't copy the rows themselves.", S.MUTED)],
    cols.map((c) => text(c.header, S.HEADER)),
    ...EXAMPLE_ROWS.map((row) => row.map((v) => text(v, S.CELL))),
    [],
    [text("Worth knowing", S.BOLD)],
    [text(`•  Opening Stock is counted at ${branchName}. Other branches start at zero — use Transfers to move stock.`, S.MUTED)],
    [text("•  An item already in your catalog with the same name is skipped, so re-uploading a file can't create duplicates.", S.MUTED)],
    [text("•  The same goes for a barcode that's already in use.", S.MUTED)],
    [text("•  Cost is never shown to staff accounts. Only owners, admins and managers with finance access see it.", S.MUTED)],
    [text("•  Up to 2,000 items per file. Split a bigger catalog across several uploads.", S.MUTED)],
    [text("•  Prices are just numbers — no currency symbols, no commas. Write 2000, not ₦2,000.", S.MUTED)],
  ];

  const howTo: Sheet = {
    name: "How to fill this in",
    rows: guide,
    cols: [{ width: 22 }, { width: 11 }, { width: 62 }, { width: 46 }],
    rowHeights: { 1: 26 },
    merges: ["A2:D2", "A5:D5", "A6:D6", "A7:D7", "A16:D16"],
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const safe = businessName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  downloadXlsx(`${safe || "startrack"}-products-${stamp}.xlsx`, [products, howTo]);
}
