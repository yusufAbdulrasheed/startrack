import { Product, badRequest, money } from "#platform/index.js";

/**
 * Made-to-order: the engine behind a blind, a curtain, a tailored piece.
 *
 * The item itself holds no stock. Its recipe (the product's `bom`) says which
 * stock products it consumes and how the amount follows the order's size: per
 * square metre, per metre of width, per metre of height, or a fixed amount per
 * item. Selling one prices it by size (the cashier may override the price),
 * works out the cost from the components, and returns a line that carries those
 * components so checkout takes THEM off the shelf, and a void or return gives
 * them back.
 *
 * Registered on the blinds service as the handler for the "made_to_order"
 * product archetype (see service.js). Checkout calls it with the cart items of
 * that archetype and gets finished sale lines back.
 */
export const madeToOrder = {
  async lines({ ctx, items, byId, session }) {
    const out = [];
    const compIds = new Set();
    for (const item of items) {
      for (const c of byId.get(item.productId).bom || []) compIds.add(String(c.productId));
    }
    const compProducts = await Product.find({ _id: { $in: [...compIds] }, businessId: ctx.businessId }).session(session);
    const compById = new Map(compProducts.map((p) => [String(p._id), p]));
    const round3 = (n) => Math.round(n * 1000) / 1000;

    for (const item of items) {
      const p = byId.get(item.productId);
      if (!p.bom?.length) {
        throw badRequest(`${p.name} has no components configured — set them up on the product first.`);
      }
      // Dimensions only matter to a recipe that actually scales by area or
      // a side (blinds, priced per m²). A plain "unit" recipe — a bowl of
      // jollof made from rice/chicken/tomato — needs none: default both to
      // 1 so the pricing formula below collapses to the item's own price.
      const needsDims = p.bom.some((c) => c.per !== "unit");
      if (needsDims && (!item.width || !item.height)) throw badRequest(`${p.name} needs width and height.`);
      const w = needsDims ? item.width : 1;
      const h = needsDims ? item.height : 1;
      const components = [];
      let lineCost = 0;
      for (const c of p.bom) {
        const comp = compById.get(String(c.productId));
        if (!comp) throw badRequest(`A component of ${p.name} no longer exists.`);
        const base =
          c.per === "sqm" ? w * h :
          c.per === "width" ? w :
          c.per === "height" ? h : 1;
        const qtyNeeded = round3(base * (c.factor || 1) * item.qty);
        if (qtyNeeded > 0) {
          components.push({ productId: comp._id, name: comp.name, qty: qtyNeeded });
          lineCost += (comp.cost || 0) * qtyNeeded;
        }
      }
      const unitPrice = item.price !== undefined ? money(item.price) : money(p.price * w * h);
      out.push({
        productId: p._id,
        name: needsDims ? `${p.name} — ${w}m × ${h}m` : p.name,
        qty: item.qty,
        unitPrice,
        lineCost: money(lineCost),
        lineNet: money(unitPrice * item.qty),
        returnedQty: 0,
        ...(needsDims ? { width: w, height: h } : {}),
        components,
      });
    }
    return out;
  },
};
