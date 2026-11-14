import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { cohortsRouter } from "./cohorts.routes.js";
import { vaccinationsRouter } from "./vaccinations.routes.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Poultry Farm.
 *
 * Owns living batches (/api/cohorts) and the vaccination & medication log
 * (/api/vaccinations). Feed and eggs are ordinary platform stock; a harvest is
 * what turns animals into sellable stock, through the platform's stock ledger.
 */
export default defineBusinessService({
  manifest,
  routes: [
    { path: "/api/vaccinations", router: vaccinationsRouter },
    { path: "/api/cohorts", router: cohortsRouter },
  ],
  ai,
  demo,
});
