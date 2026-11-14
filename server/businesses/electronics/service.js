import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { serialsRouter } from "./serials.routes.js";
import { serialNumbers } from "./checkout.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Electronics.
 *
 * Owns serial numbers: the /api/serials routes (only an electronics business
 * can reach them), the checks and bookkeeping at the till, and the assistant's
 * view of units and warranties. Repair history is a platform Job Ticket that
 * carries the unit's serial number.
 */
export default defineBusinessService({
  manifest,
  routes: [{ path: "/api/serials", router: serialsRouter }],
  checkout: { validate: serialNumbers.validate },
  ai,
  demo,
});
