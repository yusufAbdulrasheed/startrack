/**
 * Water — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. `modules`
 * are the screens only this business has, each with who may ask about it, a
 * guide to advising on it, and a builder returning the live facts behind it
 * (compact: top-N lists, counts, percentages). `snapshot` names the screens
 * whose data rides along with the whole-business overview (a key may be a
 * platform screen, e.g. "jobs").
 */
import { ProductionRun } from "./production/productionRun.model.js";

const DAY = 86_400_000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const branchOf = (ctx) => (ctx.branchId ? { branchId: ctx.branchId } : {});
const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function buildProduction(ctx) {
  const runs = await ProductionRun.find({ businessId: ctx.businessId, ...branchOf(ctx), at: { $gte: daysAgo(30) } }).sort({ at: -1 }).lean();
  const by = {};
  for (const r of runs) {
    const e = (by[r.productName] ||= { runs: 0, produced: 0, leakage: 0, credited: 0 });
    e.runs += 1; e.produced += r.producedUnits; e.leakage += r.leakage; e.credited += r.creditedQty;
  }
  const rawUse = {};
  for (const r of runs) for (const c of r.components) rawUse[c.name] = (rawUse[c.name] || 0) + c.qty;
  return {
    window: "last 30 days", runs: runs.length,
    perProduct: Object.entries(by).map(([name, e]) => ({ name, ...e, leakagePct: pct(e.leakage, e.produced + e.leakage) })),
    rawMaterialsUsed: Object.entries(rawUse).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, qty]) => ({ name, qty: Math.round(qty * 100) / 100 })),
    lastRuns: runs.slice(0, 5).map((r) => ({ runNo: r.runNo, product: r.productName, produced: r.producedUnits, leakage: r.leakage, credited: r.creditedQty, on: fmtDay(r.at) })),
  };
}

export const ai = {
  brief: `WATER FACTORY (sachet & bottled water). Raw materials (preforms, caps, labels, sachet film, bags) are converted by PRODUCTION RUNS into finished packs. Each run records units produced, LEAKAGE (burst/torn units lost) and the credited yield (e.g. 20 sachets = 1 bag, 12 bottles = 1 pack). Leakage % and raw-material consumption per pack are the core efficiency measures. Customers can buy on credit, and a loyalty rule gives free packs for repeat sachet/bag purchases. Watch: leakage rate trend, raw-material days of cover, finished-pack stock, outstanding customer credit, loyalty tokens redeemed.`,
  modules: {
    production: {
      label: "Production", perms: ["stock"], build: buildProduction,
      guide: "Turning raw materials into finished goods. Judge yield and LEAKAGE %, raw-material consumption and whether output covers demand.",
      howTo: "Set a finished product's recipe (its raw materials and the yield), then record a run: raw materials are deducted and finished stock is credited after leakage.",
    },
  },
  snapshot: ["production"],
};
