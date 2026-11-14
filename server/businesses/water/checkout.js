/**
 * Loyalty tokens: buy sachets, earn a free pack.
 *
 * Only sachet and bag lines count toward a free pack, per the business's own
 * rule. Bottles and everything else are sold as normal, they just don't earn
 * tokens. The tally lives on the customer (`sachetBagQty`) and is redeemed from
 * the loyalty screen (see loyalty.routes.js).
 *
 * Registered on the water service as its checkout `onCustomerSale` hook: it
 * runs inside the sale's transaction, only when the sale has a customer.
 */
export const loyaltyTokens = {
  async onCustomerSale({ customer, lines }) {
    const sachetBagQty = lines
      .filter((l) => /sachet|bag/i.test(l.name))
      .reduce((total, l) => total + l.qty, 0);
    if (sachetBagQty > 0) customer.sachetBagQty = (customer.sachetBagQty || 0) + sachetBagQty;
  },
};
