/**
 * Electronics — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. `modules`
 * are the screens only this business has, each with who may ask about it, a
 * guide to advising on it, and a builder returning the live facts behind it
 * (compact: top-N lists, counts, percentages). `snapshot` names the screens
 * whose data rides along with the whole-business overview (a key may be a
 * platform screen, e.g. "jobs").
 */
import { Serial } from "./serial.model.js";

const DAY = 86_400_000;
const fmtDay = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function buildSerials(ctx) {
  const rows = await Serial.aggregate([{ $match: { businessId: ctx.businessId } }, { $group: { _id: "$status", n: { $sum: 1 } } }]);
  const soon = await Serial.find({ businessId: ctx.businessId, status: "sold", warrantyExpiresAt: { $gte: new Date(), $lte: new Date(Date.now() + 30 * DAY) } })
    .sort({ warrantyExpiresAt: 1 }).limit(8).select("productName serialNo customerName warrantyExpiresAt").lean();
  const inStock = await Serial.aggregate([{ $match: { businessId: ctx.businessId, status: "in_stock" } }, { $group: { _id: "$productName", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]);
  return {
    byStatus: Object.fromEntries(rows.map((r) => [r._id, r.n])),
    inStockByModel: inStock.map((r) => ({ model: r._id, units: r.n })),
    warrantyEndingIn30d: soon.map((s) => ({ product: s.productName, serial: s.serialNo, customer: s.customerName, ends: fmtDay(s.warrantyExpiresAt) })),
  };
}

export const ai = {
  brief: `ELECTRONICS & REPAIRS. High-value units where a single unit matters. Phones/laptops are tracked by SERIAL NUMBER with status (in stock, sold, returned, repair, warranty void, written off) and warranty expiry set at sale; accessories are plain stock. Repairs are Job tickets (received → in progress → ready → collected) with parts and labour. Watch: serial-tracked units on hand, warranty expiries and claims, repair jobs overdue or ready uncollected, margin per product (staff never see cost), fast-moving accessories, low stock on high-demand models.`,
  modules: {
    serials: {
      label: "Serial numbers", perms: ["stock"], build: buildSerials,
      guide: "Unit-level tracking. Highlight warranties ending soon, units in repair/returned, and models with few units left.",
      howTo: "Register units by serial number. When a tracked unit is sold it picks up its warranty dates. Mark units as in repair, returned or written off.",
    },
  },
  snapshot: ["serials", "jobs"],
};
