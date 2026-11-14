import { defineBusinessService } from "#platform/contract.js";
import manifest from "./manifest.js";
import { ai } from "./ai.js";
import { demo } from "./demo.js";

/**
 * Supermarket / Mini-Mart.
 *
 * A plain shop needs nothing but the platform: shelf goods, a till, suppliers,
 * stock counts. So this service registers no routes and no checkout hooks, only
 * what the assistant should know and its demo data.
 */
export default defineBusinessService({ manifest, ai, demo });
