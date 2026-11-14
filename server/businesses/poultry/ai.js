/**
 * Poultry — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. `modules`
 * are the screens only this business has, each with who may ask about it, a
 * guide to advising on it, and a builder returning the live facts behind it
 * (compact: top-N lists, counts, percentages). `snapshot` names the screens
 * whose data rides along with the whole-business overview (a key may be a
 * platform screen, e.g. "jobs").
 */
import { StockMovement } from "#platform/index.js";
import { Cohort } from "./cohort.model.js";
import { VaccinationRecord } from "./vaccination.model.js";

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const branchOf = (ctx) => (ctx.branchId ? { branchId: ctx.branchId } : {});
const ageDays = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / DAY));
const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function buildVaccinations(ctx) {
  const rows = await VaccinationRecord.find({ businessId: ctx.businessId, ...branchOf(ctx) }).sort({ administeredAt: -1 }).limit(200).lean();
  const latest = new Map();
  for (const r of rows) { const k = `${r.name}|${r.batchLabel}`; if (!latest.has(k)) latest.set(k, r); }
  const now = Date.now();
  const due = [...latest.values()].filter((r) => r.nextDueAt).map((r) => ({
    name: r.name, type: r.type, batch: r.batchLabel, nextDue: fmtDay(r.nextDueAt), daysFromNow: Math.round((new Date(r.nextDueAt).getTime() - now) / DAY),
  })).sort((a, b) => a.daysFromNow - b.daysFromNow);
  return {
    overdue: due.filter((d) => d.daysFromNow < 0), dueWithin14d: due.filter((d) => d.daysFromNow >= 0 && d.daysFromNow <= 14),
    recent: rows.slice(0, 6).map((r) => ({ name: r.name, type: r.type, batch: r.batchLabel, on: fmtDay(r.administeredAt), dosage: r.dosage })),
  };
}

async function buildCohorts(ctx) {
  const cohorts = await Cohort.find({ businessId: ctx.businessId, ...branchOf(ctx) }).sort({ startDate: -1 }).limit(20).lean();
  const shape = (c) => ({
    name: c.name, species: c.species, status: c.status, ageDays: ageDays(c.startDate), started: c.initialCount, alive: c.currentCount,
    mortalityPct: pct(c.mortalityCount, c.initialCount),
    mortalityLast7d: c.events.filter((e) => e.type === "mortality" && new Date(e.at).getTime() > Date.now() - 7 * DAY).reduce((n, e) => n + (e.count || 0), 0),
    harvested: c.events.filter((e) => e.type === "harvest").reduce((n, e) => n + (e.count || 0), 0),
  });
  const feed = await StockMovement.aggregate([
    { $match: { businessId: ctx.businessId, refType: "cohort_feed", at: { $gte: daysAgo(14) } } },
    { $group: { _id: "$refId", qty: { $sum: { $abs: "$qty" } } } },
  ]);
  const feedBy = new Map(feed.map((f) => [String(f._id), f.qty]));
  return {
    active: cohorts.filter((c) => c.status === "active").map((c) => ({ ...shape(c), feedUsedLast14d: Math.round((feedBy.get(String(c._id)) || 0) * 10) / 10 })),
    closedRecently: cohorts.filter((c) => c.status === "closed").slice(0, 4).map(shape),
  };
}

export const ai = {
  brief: `POULTRY FARM. The "stock" is alive. A Cohort (flock/batch) starts with an initial count, is fed daily from feed stock, suffers MORTALITY, and is eventually HARVESTED — only at harvest does it become sellable stock (birds, eggs). Key measures: mortality % (a spike signals disease or heat stress), feed consumed per bird, age of the flock, feed days-of-cover, and the feed-to-output (conversion) ratio. A vaccination & medication log has next-due dates — an overdue vaccination is a health risk. Units are crates, bags, birds. Watch: mortality trend per cohort, overdue vaccinations/medication, feed stock vs flock size, egg/bird output, customers on credit.`,
  modules: {
    cohorts: {
      label: "Batches", perms: ["stock"], build: buildCohorts,
      guide: "Living batches (flocks). Judge mortality % against age, a sudden recent spike, feed use per bird and which batch is ready to harvest.",
      howTo: "Start a batch with its starting count, then log feed given, deaths and harvests. A harvest is what turns the animals into sellable stock.",
    },
    vaccinations: {
      label: "Vaccination & medication", perms: ["dashboard_ops"], build: buildVaccinations,
      guide: "Flock health schedule. Anything overdue is urgent; list what's due soon in order.",
      howTo: "Log each vaccination or medication with the batch, dosage and the next due date; overdue items are flagged.",
    },
  },
  snapshot: ["cohorts", "vaccinations"],
};
