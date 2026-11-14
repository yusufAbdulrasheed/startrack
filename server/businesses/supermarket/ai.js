/**
 * Supermarket — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. This
 * business has no screens of its own, so `modules` is empty; `snapshot` names
 * the platform screens whose data rides along with the whole-business overview.
 */
export const ai = {
  brief: `SUPERMARKET / MINI-MART. Plain high-volume retail of fast-moving goods. The core loop is stock in → sell → reorder. Barcodes, reorder levels, expiry dates on perishables, supplier prices and periodic stock counts matter. Margins are thin, so small cost changes and shrinkage matter. Watch: low/out-of-stock sellers (lost sales), expiring items to discount or move, slow movers tying up cash, margin by category, discount abuse and voids, stock-count variances, supplier cost creep.`,
  modules: {},
  snapshot: ["stock-count"],
};
