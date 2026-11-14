import { SEED_PHOTOS } from "#modules/auth/seedPhotos.js";
import { Job } from "#modules/jobs/job.model.js";
import { priceLines, totalsFor } from "#modules/jobs/jobs.service.js";
import { nextSeq } from "#core/counters.js";
import { money } from "#core/money.js";

/**
 * Small helpers for a business's demo data (server/businesses/<key>/demo.js):
 * dates, random picks, product photos and a job ticket. Shared here so each
 * business's demo file holds only what is particular to that business.
 */

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
export const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000);
/** Days from today, for stock that should be nearing (or past) its date. */
export const inDays = (n) => new Date(Date.now() + n * 86_400_000);

// Seeded-product photos: real, freely-licensed photos re-hosted on this app's
// own Cloudinary account (see modules/auth/seedPhotos.js), matched by keyword.
// A tag with no verified photo falls back to a coloured initials placeholder
// rather than ship a wrong or missing image.
const PALETTE = ["1a48cc", "0891b2", "7c3aed", "db2777", "ea580c", "16a34a", "0284c7", "9333ea", "dc2626", "0d9488"];
function placeholder(tags, lock) {
  const label = tags.split(",").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  const color = PALETTE[lock % PALETTE.length];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=${color}&color=fff&size=256&bold=true&format=png`;
}
export const seedImage = (tags, lock) => SEED_PHOTOS[tags] || placeholder(tags, lock);

/** A job ticket (work taken in), priced and staged through the platform's own job engine. */
export async function seedJobTicket(ctx, business, byName, { title, reference, lines, deposit, stage }) {
  const rawLines = lines.map((l) => (l.productId ? { productId: l.productId, qty: l.qty } : l));
  const { lines: priced, subtotal } = await priceLines(ctx, rawLines);
  const totals = totalsFor(business, subtotal, 0);
  const seq = await nextSeq(`job:${ctx.branchId}`);
  return Job.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
    jobNo: `J-${String(seq).padStart(5, "0")}`, title, reference, lines: priced, ...totals,
    deposit: money(deposit), depositMethod: "cash", stage,
    stageHistory: [{ stage: "received", at: daysAgo(3) }, { stage, at: daysAgo(1) }],
    promisedAt: daysAgo(-2), receivedAt: daysAgo(3), staffName: ctx.actorName,
  });
}
