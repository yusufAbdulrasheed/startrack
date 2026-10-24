/**
 * Turning the loose things people type into spreadsheets into real values:
 * "₦1,200", "5k", "12/03/2026", "6 weeks", "1h 30", "pcs". Every parser
 * returns null when it can't make sense of the input, so the importer can say
 * so instead of guessing.
 */

// Header / name comparison: case, spacing, punctuation and accents don't matter.
export const normKey = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");

export const clean = (s, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseMoney(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date || v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s) return null;
  if (/^(free|nil|n\/a|na|-)$/i.test(s)) return /^free|nil$/i.test(s) ? 0 : null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const kilo = /\d\s*k$/i.test(s);
  const mega = /\d\s*m$/i.test(s);
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;
  // "1,200.50" → 1200.50; "1.200,50" (rare) → 1200.50; "1200,5" → 1200.5
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (/,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (kilo) n *= 1_000;
  if (mega) n *= 1_000_000;
  return neg ? -n : n;
}

export const parseCount = (v) => {
  const n = parseMoney(v);
  return n === null ? null : n;
};

export function parseBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (/^(y|yes|true|1|tracked|serial(ised|ized)?|required)$/.test(s)) return true;
  if (/^(n|no|false|0|none|not tracked)$/.test(s)) return false;
  return null;
}

// Barcodes lose their zeros and turn into 1.23457E+12 when Excel treats them as numbers.
export function parseCode(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v)) : "";
  let s = String(v).trim();
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, "");
  else if (/^\d(\.\d+)?e\+?\d+$/i.test(s)) s = Number(s).toFixed(0);
  return s.slice(0, 64);
}

// Dates the way Nigerian spreadsheets write them: day first.
export function parseDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    // An unformatted Excel serial number.
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000));
    return null;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [d, mo] = [Number(m[1]), Number(m[2])];
    const y = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, mo - 1, d, 12));
    return null;
  }
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/); // 12/2026 → the end of that month
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return new Date(Date.UTC(Number(m[2]), Number(m[1]), 0, 12));
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

// ── Units ────────────────────────────────────────────────────────────
const UNIT_ALIASES = {
  pcs: "piece", pc: "piece", piece: "piece", pieces: "piece", each: "piece", ea: "piece", item: "piece", items: "piece", no: "piece", nos: "piece",
  unit: "unit", units: "unit", single: "unit",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gram: "g", grams: "g",
  l: "litre", ltr: "litre", ltrs: "litre", litre: "litre", litres: "litre", liter: "litre", liters: "litre",
  ml: "ml", cl: "cl",
  carton: "carton", cartons: "carton", ctn: "carton", ctns: "carton", box: "carton", boxes: "carton",
  crate: "crate", crates: "crate",
  bag: "bag", bags: "bag", sack: "bag", sacks: "bag",
  pack: "pack", packs: "pack", packet: "pack", packets: "pack", pkt: "pack", pkts: "pack", sachet: "pack", sachets: "pack",
  bottle: "bottle", bottles: "bottle", btl: "bottle", btls: "bottle",
  bird: "bird", birds: "bird",
  dozen: "dozen", doz: "dozen",
  tray: "tray", trays: "tray",
  meter: "metre", meters: "metre", metre: "metre", metres: "metre", m: "metre",
};

/**
 * Maps what was typed to a unit this trade actually uses. A trade with a fixed
 * list (a water factory sells in packs, bags, crates, bottles, units — never
 * "bird") never gets a unit outside it: the nearest allowed one is chosen and
 * the change is reported so it isn't silent.
 */
export function normalizeUnit(raw, allowed = []) {
  const typed = clean(raw, 30).toLowerCase();
  if (!typed) return { unit: allowed.includes("unit") || !allowed.length ? "unit" : allowed[0], note: "" };
  let unit = UNIT_ALIASES[typed.replace(/[^a-z]/g, "")] || typed.replace(/[^a-z0-9 ]/g, "").slice(0, 20) || "unit";
  if (unit === "piece" && allowed.length && !allowed.includes("piece") && allowed.includes("unit")) unit = "unit";
  if (allowed.length && !allowed.includes(unit)) {
    const fallback = allowed.includes("unit") ? "unit" : allowed[0];
    return { unit: fallback, note: `Unit “${typed}” isn't used in this trade — set to “${fallback}”` };
  }
  return { unit, note: "" };
}

// ── Durations ────────────────────────────────────────────────────────
// "6 weeks", "3 months", "12" → weeks (courses count in weeks).
export function parseWeeks(v) {
  if (typeof v === "number") return v > 0 ? Math.round(v) : null;
  const s = String(v ?? "").toLowerCase();
  const n = parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/month|mth|mo\b/.test(s)) return Math.round(n * 4.345);
  if (/year|yr/.test(s)) return Math.round(n * 52);
  if (/day/.test(s)) return Math.max(1, Math.round(n / 7));
  if (/hour|hr/.test(s)) return null; // contact hours aren't a calendar length
  return Math.round(n);
}

// "45 min", "1h 30", "1.5 hours", "90" → minutes (salon services).
export function parseMinutes(v) {
  if (typeof v === "number") return v > 0 ? Math.round(v <= 12 && Number.isInteger(v) && v < 5 ? v * 60 : v) : null; // a bare 1 or 2 is hours
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return null;
  const hm = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(?:(\d+)\s*(?:m|min|mins|minutes)?)?/);
  if (hm) return Math.round(Number(hm[1]) * 60 + Number(hm[2] || 0));
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /h/.test(s) ? Math.round(n * 60) : Math.round(n);
}

// "30 days", "1 month", "quarterly", "annual", "3" → days (gym plans).
export function parseDays(v) {
  if (typeof v === "number") return v > 0 ? Math.round(v) : null;
  const s = String(v ?? "").toLowerCase().trim();
  if (!s) return null;
  if (/^week(ly)?$/.test(s)) return 7;
  if (/^month(ly)?$/.test(s)) return 30;
  if (/^quarter(ly)?$/.test(s)) return 90;
  if (/^(half[- ]?year(ly)?|bi-?annual|semi-?annual)$/.test(s)) return 180;
  if (/^(year(ly)?|annual(ly)?)$/.test(s)) return 365;
  const n = parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (/week|wk/.test(s)) return Math.round(n * 7);
  if (/month|mth|mo\b/.test(s)) return Math.round(n * 30);
  if (/year|yr/.test(s)) return Math.round(n * 365);
  return Math.round(n);
}

export const pick = (s, table) => {
  const k = normKey(s);
  if (!k) return null;
  for (const [out, words] of Object.entries(table)) if (words.some((w) => k.includes(w))) return out;
  return null;
};
