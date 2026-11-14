/**
 * The business services StarTrack runs — the server half.
 *
 * ./manifests.js lists the same businesses as plain data (the browser reads
 * that); this lists what each one registers with the platform: routes, checkout
 * hooks, import targets, AI knowledge and demo data. The platform reaches a
 * business ONLY through server/platform/registry.js, which reads this list.
 *
 * To add a business: build server/businesses/<key>/ (manifest.js + service.js),
 * then add it here and to manifests.js.
 */
import supermarket from "./supermarket/service.js";
import blinds from "./blinds/service.js";
import electronics from "./electronics/service.js";
import academy from "./academy/service.js";
import poultry from "./poultry/service.js";
import water from "./water/service.js";

export const SERVICES = [supermarket, blinds, electronics, academy, poultry, water];
