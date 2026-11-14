import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { academyRouter } from "./academy.routes.js";
import { serviceItems } from "./checkout.js";
import { coursesTarget } from "./imports.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Training Academy / Tech School.
 *
 * Owns courses, intakes, enrolments and fees (/api/academy), the "service"
 * product archetype (a fee is sold, never counted), the course-list spreadsheet
 * import, and the assistant's view of the school. Fee payments post through the
 * platform's service-payment engine so the books match a shop's exactly.
 */
export default defineBusinessService({
  manifest,
  routes: [{ path: "/api/academy", router: academyRouter }],
  checkout: { archetypes: { service: serviceItems } },
  imports: [coursesTarget],
  ai,
  demo,
});
