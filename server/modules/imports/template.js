import ExcelJS from "exceljs";
import { getTarget, targetsFor, primaryTarget } from "#modules/imports/catalogTargets.js";

/**
 * A ready-to-fill spreadsheet for this business: the right columns for the
 * trade, one example row, and a second sheet explaining each column. Using it
 * is optional — the importer reads ordinary spreadsheets too — but it removes
 * all guesswork about what to call the columns.
 */
export async function buildTemplate(ctx, requested) {
  const available = targetsFor(ctx);
  const key = available.some((t) => t.spec.key === requested) ? requested : available.find((t) => t.spec.key === primaryTarget(ctx))?.spec.key || available[0]?.spec.key;
  const target = available.find((t) => t.spec.key === key);
  if (!target) return null;
  const spec = getTarget(key);

  const wb = new ExcelJS.Workbook();
  wb.creator = "StarTrack";
  const ws = wb.addWorksheet("Import", { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: "FF3538F0" } } });
  const header = spec.sample;
  ws.addRow(header);
  for (const r of spec.sampleRows) ws.addRow(r);
  ws.getRow(1).height = 28;
  header.forEach((h, i) => {
    const c = ws.getRow(1).getCell(i + 1);
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3538F0" } };
    c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.getColumn(i + 1).width = Math.max(16, h.length + 6);
  });
  for (let r = 2; r <= 1 + spec.sampleRows.length; r++) {
    ws.getRow(r).eachCell((c) => {
      c.font = { name: "Calibri", size: 11, italic: true, color: { argb: "FF6F7492" } };
      c.alignment = { indent: 1 };
    });
  }

  const guide = wb.addWorksheet("How to fill this in");
  guide.getColumn(1).width = 26;
  guide.getColumn(2).width = 90;
  guide.addRow([`${target.label} — what each column means`]);
  guide.getRow(1).font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF2426B8" } };
  guide.addRow([]);
  for (const f of target.fields) {
    const row = guide.addRow([f.label + (f.required ? "  (required)" : ""), `Also understood as: ${f.hints.slice(0, 5).join(", ")}`]);
    row.getCell(1).font = { name: "Calibri", bold: true };
  }
  guide.addRow([]);
  guide.addRow(["Tips", "Delete the grey example row before you upload. Names that already exist are skipped, so it is safe to upload a file twice."]);
  guide.getRow(guide.rowCount).getCell(1).font = { name: "Calibri", bold: true };

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${key.replace(/_/g, "-")}-import-template.xlsx` };
}
