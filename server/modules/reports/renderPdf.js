import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { formatValue, periodText, columnNeedsDecimals } from "#modules/reports/format.js";

/**
 * The PDF template. Drawn by hand rather than from HTML so it needs no browser
 * and works wherever the API runs.
 *
 * Fonts: Inter, bundled, in three weights. The "latin" cut has no naira sign
 * (or cedi, rupee…), so every character is checked against it and drawn from
 * the "latin-ext" cut when missing — otherwise ₦ would print as a blank box.
 */

// Where the bundled font files live. Found at first use rather than on import,
// and by several routes: next to node_modules in dev, relative to the working
// directory, and the serverless task root (see netlify.toml's included_files).
let fontDir;
function fontsDirectory() {
  if (fontDir) return fontDir;
  const rel = ["node_modules", "@fontsource", "inter", "files"];
  const tries = [];
  try {
    const require = createRequire(import.meta.url);
    tries.push(path.join(path.dirname(require.resolve("@fontsource/inter/package.json")), "files"));
  } catch { /* import.meta.url isn't available when the API is bundled into one file */ }
  tries.push(path.join(process.cwd(), ...rel));
  if (process.env.LAMBDA_TASK_ROOT) tries.push(path.join(process.env.LAMBDA_TASK_ROOT, ...rel));
  fontDir = tries.find((d) => fs.existsSync(path.join(d, "inter-latin-400-normal.woff"))) || tries[0];
  return fontDir;
}
const file = (subset, weight) => path.join(fontsDirectory(), `inter-${subset}-${weight}-normal.woff`);

// Palette — the same indigo/violet the app uses.
const C = {
  ink: "#0f1437", muted: "#6f7492", subtle: "#9a9eb8", brand: "#3538f0", violet: "#7b3cf5", deep: "#1d1f9e",
  head: "#2426b8", soft: "#f4f5fd", zebra: "#fafaff", rule: "#e9ebf5", headFill: "#eceeff", totalFill: "#f1f2ff",
  good: "#0f9f6e", bad: "#d02b3c", warn: "#c96a05", white: "#ffffff",
};
const TONE = { good: C.good, bad: C.bad, warn: C.warn };

const MARGIN = 40;
const FOOTER_H = 34;

export function renderPdf(report) {
  return new Promise((resolve, reject) => {
    const landscape = report.sections.some((s) => s.columns.length > 7);
    const doc = new PDFDocument({
      size: "A4", layout: landscape ? "landscape" : "portrait",
      margins: { top: 0, bottom: 0, left: 0, right: 0 }, // laid out by hand, so no automatic page breaks
      bufferPages: true, font: file("latin", 400),
      info: { Title: `${report.title} — ${report.business.name}`, Author: "StarTrack", Subject: report.subtitle, Creator: "StarTrack" },
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (const [w, label] of [[400, "R"], [600, "S"], [700, "B"]]) {
      doc.registerFont(label, file("latin", w));
      doc.registerFont(`${label}x`, file("latin-ext", w));
    }

    const W = doc.page.width;
    const H = doc.page.height;
    const CW = W - MARGIN * 2;
    const BOTTOM = H - FOOTER_H - 14;
    const currency = report.currency;

    // ── text with per-character font fallback ──
    const hasGlyph = {};
    const covers = (face, ch) => {
      if (!(face in hasGlyph)) { doc.font(face); hasGlyph[face] = doc._font.font; }
      return hasGlyph[face].hasGlyphForCodePoint(ch.codePointAt(0));
    };
    const runs = (str, face) => {
      const out = [];
      for (const ch of String(str)) {
        const f = ch === " " || covers(face, ch) ? face : covers(`${face}x`, ch) ? `${face}x` : face;
        if (out.length && out[out.length - 1].f === f) out[out.length - 1].t += ch;
        else out.push({ f, t: ch });
      }
      return out;
    };
    const measure = (str, face, size) => runs(str, face).reduce((n, r) => n + doc.font(r.f).fontSize(size).widthOfString(r.t), 0);
    const fit = (str, face, size, maxW) => {
      let s = String(str);
      if (measure(s, face, size) <= maxW + 0.6) return s; // +0.6: float error in column scaling must not clip a value that fits
      while (s.length > 1 && measure(`${s}…`, face, size) > maxW) s = s.slice(0, -1);
      return `${s.trimEnd()}…`;
    };
    const put = (str, x, y, { face = "R", size = 9, color = C.ink, align = "left", width = 0, opacity = 1 } = {}) => {
      let cx = x;
      if (align !== "left" && width) {
        const w = measure(str, face, size);
        cx = align === "right" ? x + width - w : x + (width - w) / 2;
      }
      doc.fillOpacity(opacity).fillColor(color);
      for (const r of runs(str, face)) {
        doc.font(r.f).fontSize(size).text(r.t, cx, y, { lineBreak: false });
        cx += doc.widthOfString(r.t);
      }
      doc.fillOpacity(1);
    };

    // ── page furniture ──
    const header = () => {
      const bandH = 134;
      const g = doc.linearGradient(0, 0, W, bandH);
      g.stop(0, C.deep).stop(0.5, C.brand).stop(1, C.violet);
      doc.rect(0, 0, W, bandH).fill(g);

      // mark + wordmark
      doc.roundedRect(MARGIN, 26, 24, 24, 7).fillOpacity(0.2).fill(C.white).fillOpacity(1);
      doc.lineWidth(2).lineCap("round").strokeColor(C.white);
      [[8, 14], [8, 20], [8, 26]].forEach(([dx], i) => {
        const y = 31 + i * 6;
        doc.moveTo(MARGIN + dx, y).lineTo(MARGIN + (i === 1 ? 14 : 18), y).stroke();
      });
      put("StarTrack", MARGIN + 34, 31, { face: "B", size: 12, color: C.white });
      put(`Generated ${new Date(report.generatedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`, MARGIN, 33, { face: "R", size: 8.5, color: C.white, align: "right", width: CW, opacity: 0.8 });

      put(report.title, MARGIN, 66, { face: "B", size: 25, color: C.white });
      put(fit(report.subtitle, "R", 10, CW), MARGIN, 99, { face: "R", size: 10, color: C.white, opacity: 0.85 });
      const meta = [report.business.name, report.branch, periodText(report)].filter(Boolean).join("   ·   ");
      put(fit(meta, "S", 9, CW), MARGIN, 116, { face: "S", size: 9, color: C.white, opacity: 0.95 });
      return bandH + 22;
    };
    const runningHead = () => {
      doc.rect(0, 0, W, 6).fill(C.brand);
      put(`${report.title} · ${report.business.name}`, MARGIN, 22, { face: "S", size: 9, color: C.muted });
      doc.moveTo(MARGIN, 40).lineTo(W - MARGIN, 40).lineWidth(0.6).strokeColor(C.rule).stroke();
      return 56;
    };

    let y = header();
    const newPage = () => { doc.addPage(); y = runningHead(); };
    const need = (h) => { if (y + h > BOTTOM) newPage(); };

    // ── KPI cards ──
    if (report.kpis.length) {
      const perRow = report.kpis.length === 4 ? 4 : report.kpis.length <= 3 ? report.kpis.length : 3;
      const gap = 12;
      const cw = (CW - gap * (perRow - 1)) / perRow;
      const ch = 56;
      report.kpis.forEach((k, i) => {
        if (i % perRow === 0) need(ch + 12);
        const col = i % perRow;
        const x = MARGIN + col * (cw + gap);
        const accent = TONE[k.tone] || C.brand;
        doc.roundedRect(x, y, cw, ch, 9).fill(C.soft);
        doc.roundedRect(x, y + 10, 3, ch - 20, 1.5).fill(accent);
        put(fit(k.label, "S", 8, cw - 26), x + 14, y + 10, { face: "S", size: 8, color: C.muted });
        const text = formatValue(k.value, k.format, currency);
        let size = 16;
        while (size > 9 && measure(text, "B", size) > cw - 28) size -= 1;
        put(text, x + 14, y + 23, { face: "B", size, color: TONE[k.tone] && k.tone !== "good" ? TONE[k.tone] : C.ink });
        if (k.hint) put(fit(k.hint, "R", 7.5, cw - 28), x + 14, y + 43, { face: "R", size: 7.5, color: C.subtle });
        if (col === perRow - 1 || i === report.kpis.length - 1) y += ch + 12;
      });
      y += 4;
    }

    // ── highlights ──
    if (report.highlights.length) {
      const lines = report.highlights.slice(0, 5);
      const h = 36 + lines.length * 17;
      need(h + 10);
      doc.roundedRect(MARGIN, y, CW, h, 10).fill(C.headFill);
      put("Highlights", MARGIN + 16, y + 13, { face: "B", size: 10, color: C.head });
      lines.forEach((t, i) => {
        const ly = y + 33 + i * 17;
        doc.circle(MARGIN + 20, ly + 4.5, 2.2).fill(C.brand);
        put(fit(t, "R", 9, CW - 52), MARGIN + 32, ly, { face: "R", size: 9, color: C.ink });
      });
      y += h + 22;
    }

    // ── tables ──
    const drawSection = (s) => {
      need(86);
      doc.roundedRect(MARGIN, y + 1, 4, 15, 2).fill(C.brand);
      put(s.title, MARGIN + 12, y, { face: "B", size: 12.5, color: C.ink });
      y += 20;
      if (s.note) { put(s.note, MARGIN + 12, y - 2, { face: "R", size: 8.5, color: C.muted }); y += 12; }
      y += 4;

      // Column widths: numbers take what they need, text shares the rest.
      const PAD = 14;
      const cols = s.columns.map((c) => {
        const dec = columnNeedsDecimals(s, c);
        const vals = s.rows.slice(0, 120).map((r) => formatValue(r[c.key], c.format, currency, dec));
        const tot = s.totals && s.totals[c.key] !== undefined ? measure(formatValue(s.totals[c.key], c.format, currency, dec), "B", 8.5) : 0;
        const natural = Math.max(measure(c.label, "S", 8), tot, ...vals.map((v) => measure(v, "R", 8.5))) + PAD * 2;
        return { ...c, dec, w: Math.min(Math.max(natural, 46), c.format === "text" ? 320 : 130), text: c.format === "text" && c.align !== "right" };
      });
      let total = cols.reduce((n, c) => n + c.w, 0);
      if (total > CW) {
        // Too wide: trim the widest text columns first, so short columns
        // (staff, status) keep their natural width and only the long ones
        // (items, notes) give way. Numbers never shrink.
        const squeezable = cols.filter((c) => c.text);
        const FLOOR = 58;
        let excess = total - CW;
        while (excess > 0.5) {
          const widest = Math.max(...squeezable.map((c) => c.w));
          if (!squeezable.length || widest <= FLOOR) break;
          const top = squeezable.filter((c) => c.w >= widest - 0.01);
          const next = Math.max(FLOOR, ...squeezable.filter((c) => c.w < widest - 0.01).map((c) => c.w));
          const cut = Math.min(excess, (widest - next) * top.length);
          top.forEach((c) => { c.w -= cut / top.length; });
          excess -= cut;
        }
      } else if (total < CW) {
        const growable = cols.filter((c) => c.text);
        const targets = growable.length ? growable : cols;
        const extra = (CW - total) / targets.length;
        for (const c of targets) c.w += extra;
      }
      total = cols.reduce((n, c) => n + c.w, 0);
      const scale = total > CW ? CW / total : 1;
      cols.forEach((c) => { c.w *= scale; });

      const cellX = (i) => MARGIN + cols.slice(0, i).reduce((n, c) => n + c.w, 0);
      const drawHead = () => {
        doc.roundedRect(MARGIN, y, CW, 24, 6).fill(C.headFill);
        cols.forEach((c, i) => put(fit(c.label, "S", 8, c.w - PAD * 2), cellX(i) + PAD, y + 8, { face: "S", size: 8, color: C.head, align: c.align === "right" ? "right" : "left", width: c.w - PAD * 2 }));
        y += 28;
      };
      drawHead();

      const RH = 21;
      const drawRow = (row, i, isTotal) => {
        if (y + RH > BOTTOM) { newPage(); drawHead(); }
        if (isTotal) {
          doc.rect(MARGIN, y, CW, RH).fill(C.totalFill);
          doc.moveTo(MARGIN, y).lineTo(MARGIN + CW, y).lineWidth(1).strokeColor(C.brand).stroke();
        } else if (i % 2 === 1) doc.rect(MARGIN, y, CW, RH).fill(C.zebra);
        cols.forEach((c, ci) => {
          const raw = row[c.key];
          if (isTotal && (raw === undefined || raw === null)) return;
          const text = fit(formatValue(raw, c.format, currency, c.dec), isTotal ? "B" : "R", 8.5, c.w - PAD * 2);
          const neg = (c.format === "money" || c.format === "decimal") && Number(raw) < 0;
          const flag = c.format === "text" && /^(voided|expired|out)/i.test(String(raw));
          put(text, cellX(ci) + PAD, y + 6.5, {
            face: isTotal ? "B" : flag ? "S" : "R", size: 8.5,
            color: neg || flag ? C.bad : isTotal ? C.head : C.ink,
            align: c.align === "right" ? "right" : "left", width: c.w - PAD * 2,
          });
        });
        if (!isTotal) doc.moveTo(MARGIN, y + RH).lineTo(MARGIN + CW, y + RH).lineWidth(0.4).strokeColor(C.rule).stroke();
        y += RH;
      };

      if (!s.rows.length) {
        put("Nothing to show for this period.", MARGIN + PAD, y + 6, { face: "R", size: 9, color: C.muted });
        y += 28;
      } else {
        s.rows.forEach((r, i) => drawRow(r, i, false));
        if (s.totals) drawRow(s.totals, 0, true);
      }
      y += 26;
    };
    report.sections.forEach(drawSection);

    // ── footers, now that the page count is known ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = H - FOOTER_H;
      doc.moveTo(MARGIN, fy).lineTo(W - MARGIN, fy).lineWidth(0.6).strokeColor(C.rule).stroke();
      put(fit(`${report.business.name}  ·  ${report.title}`, "S", 8, CW * 0.4), MARGIN, fy + 11, { face: "S", size: 8, color: C.muted });
      put(`Generated by ${report.generatedBy || "StarTrack"} with StarTrack`, MARGIN, fy + 11, { face: "R", size: 8, color: C.subtle, align: "center", width: CW });
      put(`Page ${i - range.start + 1} of ${range.count}`, MARGIN, fy + 11, { face: "S", size: 8, color: C.muted, align: "right", width: CW });
    }
    doc.end();
  });
}
