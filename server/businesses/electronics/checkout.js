import { badRequest } from "#platform/index.js";
import { Serial } from "./serial.model.js";

/**
 * Serial numbers at the till.
 *
 * A cashier may pick which specific units they are selling. Serial capture
 * NEVER blocks a sale — a line with no serial numbers simply sells as plain
 * stock — but when units ARE picked they must be real, in stock, and match the
 * quantity. That is checked BEFORE anything moves ("cheap failures first"), and
 * once the sale exists the units are marked sold with their buyer and the
 * warranty clock starts (warranty months are set per product).
 *
 * Registered on the electronics service as its checkout `validate` hook.
 */
export const serialNumbers = {
  async validate({ ctx, items, byId, lines, session }) {
    const serialsByProduct = new Map();
    for (const item of items) {
      if (!item.serialNos?.length) continue;
      serialsByProduct.set(item.productId, [...(serialsByProduct.get(item.productId) || []), ...item.serialNos]);
    }
    if (!serialsByProduct.size) return null;

    const serialUpdates = [];
    for (const line of lines) {
      if (line.components.length) continue; // made-to-order lines don't carry serials
      const given = serialsByProduct.get(String(line.productId));
      if (!given?.length) continue;
      if (given.length !== line.qty) {
        throw badRequest(`${line.name}: chose ${given.length} serial number(s) for a quantity of ${line.qty}.`);
      }
      const found = await Serial.find({
        businessId: ctx.businessId, productId: line.productId, serialNo: { $in: given }, status: "in_stock",
      }).session(session);
      if (found.length !== given.length) {
        const foundNos = new Set(found.map((s) => s.serialNo));
        const missing = given.find((s) => !foundNos.has(s));
        throw badRequest(`${missing} isn't an available serial number for ${line.name}.`);
      }
      serialUpdates.push(...found);
    }
    if (!serialUpdates.length) return null;

    return {
      // Runs inside the sale's transaction, once the sale exists.
      async commit(txSession, { saleId, customer }) {
        for (const serial of serialUpdates) {
          serial.status = "sold";
          serial.saleId = saleId;
          serial.customerId = customer?._id || null;
          serial.customerName = customer?.name || "";
          serial.soldAt = new Date();
          const warrantyMonths = byId.get(String(serial.productId))?.warrantyMonths || 0;
          if (warrantyMonths > 0) {
            const expires = new Date(serial.soldAt);
            expires.setMonth(expires.getMonth() + warrantyMonths);
            serial.warrantyExpiresAt = expires;
          }
          await serial.save({ session: txSession });
        }
      },
    };
  },
};
