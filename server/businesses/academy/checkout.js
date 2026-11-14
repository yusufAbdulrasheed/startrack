import { money } from "#platform/index.js";

/**
 * Services: a registration fee, tuition, an exam, a workshop.
 *
 * A service is sold, never counted. There is no stock to run out of, so lines
 * for the same service simply merge, are priced from the catalogue (or the
 * price an online customer was quoted), and are flagged `service: true`. That
 * flag is what keeps a void or a return from putting stock back that never left.
 *
 * Registered on the academy service as the handler for the "service" product
 * archetype (see service.js).
 */
export const serviceItems = {
  async lines({ items, byId, opts }) {
    const qtyByService = new Map();
    for (const item of items) qtyByService.set(item.productId, (qtyByService.get(item.productId) || 0) + item.qty);
    const out = [];
    for (const [productId, qty] of qtyByService) {
      const p = byId.get(productId);
      const unit = opts.quotedPrices?.get(productId) ?? p.price;
      out.push({
        productId: p._id, name: p.name, qty, unitPrice: unit,
        lineCost: money((p.cost || 0) * qty), lineNet: money(unit * qty),
        returnedQty: 0, service: true, components: [],
      });
    }
    return out;
  },
};
