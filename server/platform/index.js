/**
 * The platform's public interface — what a business service may use.
 *
 * Everything a business (server/businesses/<key>/) needs from the shared
 * platform comes through this one file. If a business needs something that is
 * not here, the answer is to add it here deliberately (so the platform knows it
 * now has a promise to keep), never to reach into a platform module's
 * internals. `npm run check:architecture` fails the build if a business
 * imports anything else from the platform, or imports another business.
 *
 * What the platform provides, in five groups:
 *   Requests     the tenant context (req.ctx) and the gates a route can use.
 *   Data         the shared records a business builds on (products, stock,
 *                customers, job tickets). A business owns its OWN collections
 *                (models inside its folder); these belong to the platform.
 *   Money        the sale/payment and daily-figures engines.
 *   Stock        movements and the alerts that follow them.
 *   Utilities    transactions, auditing, counters, errors, money maths.
 */

// ── Requests ──────────────────────────────────────────────────────────────
export { requirePerm, requireBranch, requireCapability, requireFeature, canSeeCost, planRequired, limitProblem } from "#core/middleware/tenant.js";

// ── Data the platform owns ────────────────────────────────────────────────
export { Product } from "#modules/products/product.model.js";
export { Customer } from "#modules/customers/customer.model.js";
export { StockMovement } from "#modules/inventory/stockMovement.model.js";
export { Inventory } from "#modules/inventory/inventory.model.js";
export { Job } from "#modules/jobs/job.model.js";

// ── Money ─────────────────────────────────────────────────────────────────
export { resolveCustomer, postServicePayment, reverseServicePayment, servicePaymentsSince } from "#modules/services/servicePayment.js";
export { localDay, bumpDailyMetric } from "#modules/metrics/metrics.service.js";
export { applyCreditChange } from "#modules/customers/customerLedger.model.js";

// ── Stock ─────────────────────────────────────────────────────────────────
export { applyMovement } from "#modules/inventory/inventory.service.js";
export { afterStockChange } from "#modules/alerts/alerts.service.js";

// ── Utilities ─────────────────────────────────────────────────────────────
export { withTransaction } from "#core/tx.js";
export { audit } from "#core/audit.js";
export { nextSeq } from "#core/counters.js";
export { money } from "#core/money.js";
export { escapeRegex } from "#core/regex.js";
export { HttpError, badRequest, conflict, notFound } from "#core/httpError.js";

// ── Spreadsheet import ────────────────────────────────────────────────────
// What a business needs to describe its own list to the importer (see imports.js in a business).
export { importField, cell, isEmpty, clean, parseMoney, parseWeeks, normKey, pickChoice } from "#platform/importKit.js";

// ── Demo data ─────────────────────────────────────────────────────────────
// Helpers for a business's own sample data (server/businesses/<key>/demo.js).
export { pick, randInt, daysAgo, inDays, seedImage, seedJobTicket } from "#platform/demoKit.js";
