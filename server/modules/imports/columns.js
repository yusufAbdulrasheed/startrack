import { normKey } from "#modules/imports/values.js";

/**
 * Finding which spreadsheet column is which. Business spreadsheets label the
 * same thing a dozen ways ("Qty", "Quantity", "Units sold"), so each field has a
 * list of names it answers to; the first header that matches wins, and the owner
 * can correct any guess in the importer before anything is saved.
 */
export function guessColumns(headers, spec) {
  const keyed = headers.map((h) => ({ h, k: normKey(h) }));
  const taken = new Set();
  const out = {};
  // Exact names first, then "contains", so "Unit price" isn't grabbed by "price" before "Price".
  for (const pass of ["exact", "contains"]) {
    for (const [field, names] of Object.entries(spec)) {
      if (out[field]) continue;
      const want = names.map(normKey);
      const hit = keyed.find(({ h, k }) => !taken.has(h) && (pass === "exact" ? want.includes(k) : want.some((w) => w.length >= 4 && k.includes(w))));
      if (hit) { out[field] = hit.h; taken.add(hit.h); }
    }
  }
  return out;
}

/** The mapping the owner confirmed, checked against the real headers — never trusted blindly. */
export function cleanMapping(raw, headers, spec) {
  let given = {};
  try { given = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {}; } catch { given = {}; }
  const known = new Set(headers);
  const out = {};
  for (const field of Object.keys(spec)) {
    const col = given[field];
    if (typeof col === "string" && known.has(col)) out[field] = col;
  }
  return out;
}

/** Of several sheets in a workbook, the one whose headers fit the spec best. */
export function bestTable(tables, spec) {
  let best = null;
  for (const t of tables) {
    const score = Object.keys(guessColumns(t.headers, spec)).length;
    if (!best || score > best.score || (score === best.score && t.total > best.table.total)) best = { table: t, score };
  }
  return best?.table || tables[0];
}
