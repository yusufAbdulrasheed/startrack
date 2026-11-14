import { SERVICES } from "#businesses/services.js";
import { requireFeature } from "#core/middleware/tenant.js";

/**
 * The registry of installed business services.
 *
 * This is the ONE place the platform meets the businesses. Everything else in
 * the platform asks the registry ("what does the business of type X register
 * for checkout / import / AI / demo?") and never imports a business directly.
 * Unknown types (an account made before a business was retired) simply have no
 * service, and are run as plain retail.
 */

const byKey = new Map(SERVICES.map((s) => [s.key, s]));

/** The service for a business type, or null (plain retail). */
export const serviceFor = (typeKey) => byKey.get(typeKey) || null;

/** Every installed service. */
export const allServices = () => SERVICES;

/** The checkout hooks a business registered (an empty object for plain retail). */
export const checkoutFor = (typeKey) => serviceFor(typeKey)?.checkout || {};

/** The spreadsheet import targets only this business has. */
export const importTargetsFor = (typeKey) => serviceFor(typeKey)?.imports || [];

/** What the assistant knows about this business: { brief, modules, snapshot, howTo }. */
export const aiFor = (typeKey) => serviceFor(typeKey)?.ai || {};

/** The business's demo definition ({ shop, seed }) or null. */
export const demoFor = (typeKey) => serviceFor(typeKey)?.demo || null;

/** Keys of every business that has demo data, in menu order. */
export const demoKeys = () => SERVICES.filter((s) => s.demo).map((s) => s.key);

/** Only the business a router belongs to may reach it. */
const onlyFor = (key) => (req, res, next) => {
  if (req.ctx?.business?.typeKey === key) return next();
  return res.status(404).json({ error: "not_available", message: "This business doesn't use that feature." });
};

/**
 * Mounts every business's routers. Each sits behind sign-in and the tenant
 * context (`gate`, supplied by app.js), the business-type check above, and the
 * plan feature the route names (default "verticals").
 */
export function mountBusinessServices(app, gate) {
  for (const s of SERVICES) {
    for (const r of s.routes) {
      app.use(r.path, gate, onlyFor(s.key), ...(r.feature ? [requireFeature(r.feature)] : []), r.router);
    }
  }
}
