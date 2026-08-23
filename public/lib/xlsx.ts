/**
 * A very small XLSX reader and writer.
 *
 * An .xlsx file is a ZIP of XML parts, so both directions are achievable
 * without a library: we write STORED (uncompressed) ZIP entries, and read by
 * inflating with the browser's own DecompressionStream. That keeps a ~400KB
 * spreadsheet dependency out of a bundle that is already large, and means the
 * template we hand people is a genuine Excel file rather than a CSV wearing
 * the wrong extension.
 *
 * Only the parts of the format StarTrack actually needs are implemented:
 * inline strings, numbers, dates, column widths, a frozen styled header,
 * and one dropdown.
 */

// ── shared helpers ───────────────────────────────────────────────────

const enc = new TextEncoder();

const XML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };
const x = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => XML_ESC[c]);

/** A1, B1 … Z1, AA1 … for a zero-based column index. */
export function colName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

// Excel counts days from 1899-12-30 (the leap-year bug is part of the format).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;
export const excelSerialToISO = (serial: number) =>
  new Date(EXCEL_EPOCH + Math.round(serial) * DAY).toISOString().slice(0, 10);

// ── ZIP writing ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type ZipEntry = { name: string; data: Uint8Array };

/** Builds a ZIP with stored (method 0) entries — no compressor needed. */
function zip(entries: ZipEntry[]): Blob {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  // A fixed timestamp keeps the output byte-identical between downloads.
  const time = 0;
  const date = ((2020 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, entry.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  // Cast: TS models Uint8Array's buffer as possibly SharedArrayBuffer, which
  // BlobPart excludes. Everything here is a plain ArrayBuffer.
  return new Blob([...chunks, ...central, end] as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── worksheet building ───────────────────────────────────────────────

/** Style slots defined in styles.xml below. */
export const S = {
  DEFAULT: 0,
  HEADER: 1,
  TITLE: 2,
  MONEY: 3,
  INT: 4,
  TEXT: 5,
  BOLD: 6,
  MUTED: 7,
  CELL: 8,
  PANEL: 9,
} as const;

export type Cell =
  | { v: string | number; s?: number; type?: "text" | "number" }
  | null
  | undefined;

export type Sheet = {
  name: string;
  rows: Cell[][];
  cols?: { width: number }[];
  freezeHeader?: boolean;
  autoFilterCols?: number;
  /** Dropdown on one column, e.g. { col: 1, values: [...], lastRow: 500 } */
  validation?: { col: number; values: string[]; lastRow: number };
  merges?: string[];
  rowHeights?: Record<number, number>;
};

function sheetXml(sheet: Sheet): string {
  const rows = sheet.rows
    .map((cells, r) => {
      const rowNum = r + 1;
      const height = sheet.rowHeights?.[rowNum];
      const body = cells
        .map((cell, c) => {
          if (cell === null || cell === undefined || cell.v === "") {
            // Still emit the cell when it carries a style, so empty rows keep
            // their borders and number formats for whatever gets typed in.
            return cell?.s ? `<c r="${colName(c)}${rowNum}" s="${cell.s}"/>` : "";
          }
          const ref = `${colName(c)}${rowNum}`;
          const style = cell.s ? ` s="${cell.s}"` : "";
          const isNumber = cell.type === "number" || (cell.type !== "text" && typeof cell.v === "number");
          if (isNumber) return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${x(cell.v)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNum}"${height ? ` ht="${height}" customHeight="1"` : ""}>${body}</row>`;
    })
    .join("");

  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols
        .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const pane = sheet.freezeHeader
    ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>`
    : "";

  const filter = sheet.autoFilterCols
    ? `<autoFilter ref="A1:${colName(sheet.autoFilterCols - 1)}1"/>`
    : "";

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";

  // Excel caps an inline list at 255 characters — trim rather than emit a
  // file it will report as corrupt.
  let validation = "";
  if (sheet.validation?.values.length) {
    const letter = colName(sheet.validation.col);
    let list = "";
    for (const v of sheet.validation.values.map((s) => s.replace(/[",]/g, " ").trim()).filter(Boolean)) {
      if (list.length + v.length + 1 > 250) break;
      list += (list ? "," : "") + v;
    }
    if (list) {
      validation =
        `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0"` +
        ` sqref="${letter}2:${letter}${sheet.validation.lastRow}"><formula1>"${list}"</formula1></dataValidation></dataValidations>`;
    }
  }

  // Element order matters to Excel's schema: views, format, cols, data,
  // autoFilter, merges, validations.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}${merges}${validation}</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="@"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF1A48CC"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1A48CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9DEE7"/></left><right style="thin"><color rgb="FFD9DEE7"/></right><top style="thin"><color rgb="FFD9DEE7"/></top><bottom style="thin"><color rgb="FFD9DEE7"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>`;

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument.spreadsheetml";

/** Builds the workbook and hands it to the browser as a download. */
export function downloadXlsx(filename: string, sheets: Sheet[]) {
  const parts: ZipEntry[] = [];
  const add = (name: string, xml: string) => parts.push({ name, data: enc.encode(xml) });

  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`)
      .join("")}<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/></Types>`
  );

  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );

  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${sheets
      .map((s, i) => `<sheet name="${x(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`
  );

  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`
  );

  add("xl/styles.xml", STYLES_XML);
  sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));

  const url = URL.createObjectURL(zip(parts));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── XLSX reading ─────────────────────────────────────────────────────

export const canReadXlsx = () => typeof DecompressionStream !== "undefined";

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads the ZIP central directory and returns each entry's bytes. */
async function unzip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Uint8Array>();

  // The end-of-central-directory record lives in the last ~64KB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file.");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats the name/extra lengths, and they can differ.
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(start, start + compressedSize);

    files.set(name, method === 0 ? raw : await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_m, code) =>
    code === "amp" ? "&" : code === "lt" ? "<" : code === "gt" ? ">" :
    code === "quot" ? '"' : code === "apos" ? "'" :
    String.fromCharCode(Number(code.slice(1)))
  );

function textOf(fragment: string): string {
  // Concatenates every <t> in a cell or shared-string entry (rich text is
  // split across runs).
  const out: string[] = [];
  const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out.push(unescapeXml(m[1]));
  return out.join("");
}

/**
 * Reads the first worksheet into rows of strings, keyed by the header row —
 * the same shape parseCsv returns, so the import path stays identical.
 *
 * Header keys are normalised the same way too (lowercased, non-alphanumerics
 * stripped), which is why a header can read "Price * (₦)" and still match.
 */
export async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  if (!canReadXlsx()) throw new Error("This browser can't open .xlsx here — save the sheet as CSV and try again.");
  const files = await unzip(await file.arrayBuffer());
  const decoder = new TextDecoder();

  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedXml) {
    const src = decoder.decode(sharedXml);
    const re = /<si>([\s\S]*?)<\/si>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) shared.push(textOf(m[1]));
  }

  // Take the first worksheet in the book.
  const sheetName =
    [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("That file has no worksheets.");
  const src = decoder.decode(files.get(sheetName)!);

  const grid: string[][] = [];
  const rowRe = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(src))) {
    const rowIndex = Number(rowMatch[1]) - 1;
    const cells: string[] = [];
    const cellRe = /<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[2]))) {
      const letters = cellMatch[1];
      let col = 0;
      for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
      col -= 1;

      const attrs = cellMatch[2] || "";
      const body = cellMatch[3] || "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1];

      let value = "";
      if (type === "s") {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? -1);
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "str") {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      } else {
        value = unescapeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }
      cells[col] = value.trim();
    }
    grid[rowIndex] = cells;
  }

  const rows = grid.filter((r) => r && r.some((v) => v && v.trim() !== ""));
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => (h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      let v = (r[i] ?? "").trim();
      // A date typed into Excel arrives as a serial number. Anything in this
      // window is a date between 1954 and 2119 — far outside the range of a
      // price or a quantity, so the guess is safe for the expiry column.
      if (h.startsWith("expiry") && /^\d{5}(\.\d+)?$/.test(v)) {
        const n = Number(v);
        if (n > 20000 && n < 80000) v = excelSerialToISO(n);
      }
      obj[h] = v;
    });
    return obj;
  });
}
