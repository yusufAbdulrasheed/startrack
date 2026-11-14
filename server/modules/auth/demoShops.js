import { demoKeys, demoFor } from "#platform/registry.js";
import { lazyRecord } from "#platform/lazy.js";

/**
 * The demo shops a visitor can choose between — one per business StarTrack
 * runs, so the sandbox speaks their vocabulary from the first screen.
 *
 * Each business defines its own sample shop (catalogue, branch, a line saying
 * what to try) in server/businesses/<key>/demo.js; this just gathers them in
 * menu order.
 *
 *   depth: "full"    — the business's whole workflow is implemented
 *          "catalog" — correct vocabulary and stock, workflow still being built
 */
// Built on first use, not at import: see platform/lazy.js.
export const DEMOS = lazyRecord(() => Object.fromEntries(demoKeys().map((key) => [key, demoFor(key).shop])));
