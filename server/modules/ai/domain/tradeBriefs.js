import { aiFor } from "#platform/registry.js";

/**
 * What the AI must understand about a business before it says a word.
 *
 * A supermarket's "low stock" advice is nonsense for an academy (it sells
 * seats) or a poultry farm (the stock is alive). Each business writes its own
 * brief in server/businesses/<key>/ai.js: how it actually makes money, the
 * words its owner uses, what to watch, and the mistakes a generic retail
 * assistant would make. This file only looks the brief up.
 *
 * A business with no brief (an account from before a business was retired)
 * gets the generic one below.
 */
export const GENERIC_BRIEF =
  "GENERAL BUSINESS. A small business using StarTrack for sales, stock, staff and customers. Reason from the numbers given.";

export function tradeBrief(typeKey) {
  return aiFor(typeKey).brief || GENERIC_BRIEF;
}
