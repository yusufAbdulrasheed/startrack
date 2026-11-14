import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { productionRouter } from "./production/production.routes.js";
import { loyaltyRouter } from "./loyalty.routes.js";
import { loyaltyTokens } from "./checkout.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Water Factory / Table Water.
 *
 * Owns production runs (/api/production) and loyalty tokens (/api/loyalty,
 * earned at the till through the checkout hook). Customer credit is a platform
 * feature this business switches on in its manifest.
 */
export default defineBusinessService({
  manifest,
  routes: [
    { path: "/api/production", router: productionRouter },
    // Loyalty tokens are their own plan feature, not part of "trade-specific tools".
    { path: "/api/loyalty", router: loyaltyRouter, feature: "loyalty" },
  ],
  checkout: { onCustomerSale: loyaltyTokens.onCustomerSale },
  ai,
  demo,
});
