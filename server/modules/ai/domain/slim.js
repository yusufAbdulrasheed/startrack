/**
 * Makes data cheap to send to the model without changing what it can say.
 *
 * Database ids (24 hex characters each) tokenise terribly and the model never
 * needs one — it names people, products and classes, and any action it
 * proposes is resolved by NAME on the server (aiActions.service.js). The AI
 * provider also meters tokens per minute across the whole account, so every
 * token trimmed here is headroom for another business's question.
 */

const ID_KEY = /(^_?id$|Id$|Ids$)/;

export function slim(value) {
  if (Array.isArray(value)) return value.map(slim);
  if (value && typeof value === "object") {
    if (value instanceof Date) return value;
    // ObjectIds and Dates stringify themselves; leave anything exotic alone.
    if (typeof value.toHexString === "function") return undefined;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (ID_KEY.test(k)) continue;
      const s = slim(v);
      if (s === undefined) continue;
      out[k] = s;
    }
    return out;
  }
  return value;
}
