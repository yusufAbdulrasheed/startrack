import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { madeToOrder } from "./checkout.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Window Blinds & Curtains.
 *
 * Owns the made-to-order engine: this business is the only one whose checkout
 * can sell an item built from components by size. Installation work uses the
 * platform's Job Tickets (declared as a capability in the manifest).
 */
export default defineBusinessService({
  manifest,
  checkout: { archetypes: { made_to_order: madeToOrder } },
  ai,
  demo,
});
