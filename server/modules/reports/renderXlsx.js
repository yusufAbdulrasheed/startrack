import ExcelJS from "exceljs";
import { formatValue, periodText, columnNeedsDecimals } from "#modules/reports/format.js";

/**
 * The Excel template. One "Summary" sheet laid out like a dashboard (banner,
 * KPI tiles, highlights), then one sheet per table with a branded header row,
 * banded rows, real number formats (so the cells still sum and sort), frozen
 * headers and filters.
 */

const C = {
  brand: "FF3538F0", deep: "FF1D1F9E", head: "FF2426B8", soft: "FFF4F5FD", headFill: "FFECEEFF", zebra: "FFFAFAFF",
  rule: "FFE9EBF5", ink: "FF0F1437", muted: "FF6F7492", white: "FFFFFFFF", good: "FF0F9F6E", bad: "FFD02B3C", warn: "FFC96A05",
};
const TONE = { good: C.good, bad: C.bad, warn: C.warn };
const FONT = "Calibri";
const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = (argb) => ({ style: "thin", color: { argb } });

// Excel number formats, with the business's own currency symbol baked in.
function numFmt(format, currency, dec = true) {
  const cur = currency.replace(/"/g, "");
  switch (format) {
    case "money": return dec ? `"${cur}"#,##0.00;[Red]-"${cur}"#,##0.00` : `"${cur}"#,##0;[Red]-"${cur}"#,##0`;
    case "int": return "#,##0";
    case "decimal": return "#,##0.0#";
    case "pct": return '0.0"%"';
    case "date": return "dd mmm yyyy";
    case "datetime": return "dd mmm yyyy hh:mm";
    default: return "@";
  }
}

const sheetName = (title, used) => {
  let n = title.replace(/[:\\/?*[\]]/g, " ").slice(0, 28).trim() || "Sheet";
  let i = 2;
  const base = n;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

export async function renderXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StarTrack";
  wb.title = `${report.title} — ${report.business.name}`;
  wb.subject = report.subtitle;
  wb.created = new Date(report.generatedAt);
  const currency = report.currency;
  const used = new Set(["summary"]);

  // ── Summary sheet ──
  const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }], properties: { tabColor: { argb: C.brand } } });
  ws.columns = [{ width: 3 }, ...Array.from({ length: 6 }, () => ({ width: 19 })), { width: 3 }];

  const band = (row, text, { size, bold, color, height, fill }) => {
    ws.mergeCells(row, 2, row, 7);
    const c = ws.getCell(row, 2);
    c.value = text;
    c.font = { name: FONT, size, bold, color: { argb: color } };
    c.fill = solid(fill);
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getRow(row).height = height;
    for (let col = 2; col <= 7; col++) ws.getCell(row, col).fill = solid(fill);
  };
  ws.getRow(1).height = 10;
  band(2, report.title, { size: 22, bold: true, color: C.white, height: 40, fill: C.brand });
  band(3, report.subtitle, { size: 11, bold: false, color: "FFE4E6FF", height: 22, fill: C.brand });
  band(4, [report.business.name, report.branch, periodText(report), `Generated ${new Date(report.generatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`].filter(Boolean).join("   ·   "),
    { size: 10, bold: true, color: C.head, height: 24, fill: C.headFill });

  let row = 6;
  if (report.kpis.length) {
    const perRow = 3;
    report.kpis.forEach((k, i) => {
      const col = 2 + (i % perRow) * 2;
      const r = row + Math.floor(i / perRow) * 4;
      const accent = TONE[k.tone] || C.brand;
      ws.mergeCells(r, col, r, col + 1);
      ws.mergeCells(r + 1, col, r + 1, col + 1);
      ws.mergeCells(r + 2, col, r + 2, col + 1);
      const label = ws.getCell(r, col);
      label.value = k.label;
      label.font = { name: FONT, size: 9, bold: true, color: { argb: C.muted } };
      const val = ws.getCell(r + 1, col);
      const numeric = typeof k.value === "number";
      val.value = numeric ? k.value : String(k.value);
      if (numeric) val.numFmt = numFmt(k.format, currency);
      val.font = { name: FONT, size: 18, bold: true, color: { argb: k.tone && k.tone !== "good" ? TONE[k.tone] : C.ink } };
      val.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      label.alignment = { horizontal: "left", vertical: "bottom", indent: 1 };
      const hint = ws.getCell(r + 2, col);
      hint.value = k.hint || "";
      hint.font = { name: FONT, size: 8, color: { argb: C.muted } };
      hint.alignment = { horizontal: "left", vertical: "top", indent: 1 };
      for (let rr = r; rr <= r + 2; rr++) {
        for (let cc = col; cc <= col + 1; cc++) {
          const cell = ws.getCell(rr, cc);
          cell.fill = solid(C.soft);
          cell.border = {
            ...(cc === col ? { left: { style: "thick", color: { argb: accent } } } : {}),
            ...(rr === r ? { top: thin(C.rule) } : {}),
            ...(rr === r + 2 ? { bottom: thin(C.rule) } : {}),
            ...(cc === col + 1 ? { right: thin(C.rule) } : {}),
          };
        }
      }
      ws.getRow(r).height = 20;
      ws.getRow(r + 1).height = 32;
      ws.getRow(r + 2).height = 16;
    });
    row += Math.ceil(report.kpis.length / perRow) * 4 + 1;
  }

  if (report.highlights.length) {
    ws.mergeCells(row, 2, row, 7);
    const h = ws.getCell(row, 2);
    h.value = "Highlights";
    h.font = { name: FONT, size: 12, bold: true, color: { argb: C.head } };
    ws.getRow(row).height = 24;
    row++;
    for (const t of report.highlights.slice(0, 6)) {
      ws.mergeCells(row, 2, row, 7);
      const c = ws.getCell(row, 2);
      c.value = `●  ${t}`;
      c.font = { name: FONT, size: 10.5, color: { argb: C.ink } };
      c.alignment = { wrapText: true, vertical: "middle", indent: 1 };
      for (let cc = 2; cc <= 7; cc++) {
        ws.getCell(row, cc).fill = solid(C.headFill);
      }
      ws.getRow(row).height = 22;
      row++;
    }
    row++;
  }

  if (report.sections.length) {
    ws.mergeCells(row, 2, row, 7);
    const c = ws.getCell(row, 2);
    c.value = `This workbook has ${report.sections.length} more sheet${report.sections.length === 1 ? "" : "s"}: ${report.sections.map((s) => s.title).join(", ")}.`;
    c.font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
    c.alignment = { wrapText: true, vertical: "top" };
    ws.getRow(row).height = 30;
  }
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // ── One sheet per table ──
  for (const s of report.sections) {
    const sheet = wb.addWorksheet(sheetName(s.title, used), { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
    const nCols = s.columns.length;
    s.columns.forEach((c) => { c.dec = columnNeedsDecimals(s, c); });

    // widths from content
    s.columns.forEach((c, i) => {
      const lens = [c.label.length + 3, ...s.rows.slice(0, 200).map((r) => formatValue(r[c.key], c.format, currency, c.dec).length), s.totals ? formatValue(s.totals[c.key], c.format, currency, c.dec).length + 1 : 0];
      sheet.getColumn(i + 1).width = Math.min(Math.max(Math.max(...lens) + 3, 11), c.format === "text" ? 50 : 22);
    });

    sheet.mergeCells(1, 1, 1, nCols);
    const t = sheet.getCell(1, 1);
    t.value = `${s.title}  ·  ${report.business.name}`;
    t.font = { name: FONT, size: 15, bold: true, color: { argb: C.white } };
    t.alignment = { vertical: "middle", indent: 1 };
    for (let cc = 1; cc <= nCols; cc++) sheet.getCell(1, cc).fill = solid(C.brand);
    sheet.getRow(1).height = 32;

    sheet.mergeCells(2, 1, 2, nCols);
    const note = sheet.getCell(2, 1);
    note.value = [s.note, periodText(report), report.branch].filter(Boolean).join("   ·   ");
    note.font = { name: FONT, size: 9.5, color: { argb: C.muted } };
    note.alignment = { vertical: "middle", indent: 1 };
    sheet.getRow(2).height = 20;
    sheet.getRow(3).height = 6;

    const head = sheet.getRow(4);
    s.columns.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.label;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.head } };
      cell.fill = solid(C.headFill);
      cell.alignment = { vertical: "middle", horizontal: c.align === "right" ? "right" : "left", indent: 1 };
      cell.border = { bottom: { style: "medium", color: { argb: C.brand } } };
    });
    head.height = 26;

    const writeRow = (r, data, { total = false, band = false } = {}) => {
      s.columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        const raw = data[c.key];
        if (raw === undefined || raw === null || raw === "") { cell.value = total ? "" : "—"; }
        else if (["money", "int", "decimal", "pct"].includes(c.format) && Number.isFinite(Number(raw))) { cell.value = Number(raw); cell.numFmt = numFmt(c.format, currency, c.dec); }
        else if ((c.format === "date" || c.format === "datetime") && !Number.isNaN(new Date(raw).getTime())) { cell.value = new Date(raw); cell.numFmt = numFmt(c.format, currency); }
        else cell.value = String(raw);
        cell.font = { name: FONT, size: 10, bold: total, color: { argb: total ? C.head : C.ink } };
        cell.alignment = { vertical: "middle", horizontal: c.align === "right" ? "right" : "left", indent: 1 };
        cell.fill = total ? solid(C.headFill) : band ? solid(C.zebra) : { type: "pattern", pattern: "none" };
        cell.border = total ? { top: { style: "medium", color: { argb: C.brand } } } : { bottom: thin(C.rule) };
      });
      r.height = 21;
    };
    s.rows.forEach((data, i) => writeRow(sheet.getRow(5 + i), data, { band: i % 2 === 1 }));
    let last = 4 + s.rows.length;
    if (s.totals) { writeRow(sheet.getRow(5 + s.rows.length), s.totals, { total: true }); last++; }
    if (!s.rows.length) {
      sheet.mergeCells(5, 1, 5, nCols);
      sheet.getCell(5, 1).value = "Nothing to show for this period.";
      sheet.getCell(5, 1).font = { name: FONT, size: 10, italic: true, color: { argb: C.muted } };
      sheet.getCell(5, 1).alignment = { indent: 1 };
    } else {
      sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + s.rows.length, column: nCols } };
    }
    sheet.pageSetup = { orientation: nCols > 6 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printTitlesRow: "4:4" };
    sheet.headerFooter = { oddFooter: `&L${report.business.name} · ${s.title}&RPage &P of &N` };
    void last;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
