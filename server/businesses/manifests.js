/**
 * The businesses StarTrack runs — as DATA. One line per business.
 *
 * This list is read by the server and the browser alike (through
 * server/shared/businessTypes.js), so it holds manifests only: plain objects, no
 * server code. The server-side half of each business (routes, models, checkout
 * and AI hooks, demo data) is registered in ./services.js.
 *
 * To add a business: create server/businesses/<key>/ with a manifest.js and a
 * service.js, then add it here and in services.js. Nothing else in the
 * platform needs to change.
 */
import supermarket from "./supermarket/manifest.js";
import blinds from "./blinds/manifest.js";
import electronics from "./electronics/manifest.js";
import academy from "./academy/manifest.js";
import poultry from "./poultry/manifest.js";
import water from "./water/manifest.js";

export const MANIFESTS = [supermarket, blinds, electronics, academy, poultry, water];
