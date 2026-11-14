import { clean, parseMoney, parseWeeks, normKey, pick as pickChoice } from "#modules/imports/values.js";

/**
 * What a business needs to teach the spreadsheet importer about its own list
 * (server/businesses/<key>/imports.js): the field builder, the row helpers and
 * the value parsers. The importer itself (modules/imports) stays in the
 * platform; a business only describes ITS catalogue.
 */

// `hints` are normalised header names (see normKey). `exclude` rejects a header
// that merely contains a hint ("Supplier name" is not the item's name).
export const importField = (key, label, hints, { required = false, exclude = null } = {}) => ({ key, label, hints, required, exclude: exclude ? new RegExp(exclude) : null });

export const cell = (row, mapping, key) => (mapping[key] ? row[mapping[key]] : undefined);
export const isEmpty = (v) => v === undefined || v === null || v === "";

export { clean, parseMoney, parseWeeks, normKey, pickChoice };
