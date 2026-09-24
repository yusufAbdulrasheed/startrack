import crypto from "node:crypto";
import QRCode from "qrcode";
import { LoyaltyCard } from "#modules/loyalty/loyaltyCard.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { sendMail, emailShell, esc } from "#core/mailer.js";

const genCode = () => crypto.randomBytes(15).toString("base64url"); // 20 chars, ~120 bits

/**
 * Issues a card for a customer, unconditionally — the low-level primitive
 * both the patronage trigger below AND Phase 6's gym signup call into.
 * Accepts a session so a caller inside a transaction (e.g. a gym
 * subscription purchase) can create the card atomically with everything
 * else; called with no session, it just writes directly.
 */
export async function issueCardForCustomer(ctx, customerId, issuedVia = "patronage", session = undefined) {
  const existing = await LoyaltyCard.findOne({ businessId: ctx.businessId, customerId, status: "active" }).session(session || null);
  if (existing) return existing;

  const [card] = await LoyaltyCard.create(
    [{ accountId: ctx.accountId, businessId: ctx.businessId, customerId, code: genCode(), issuedVia }],
    { session }
  );
  return card;
}

/**
 * The sales-hook-specific decision: does this customer NOW qualify for a
 * card, per the business's own configured rule? Read-only against a rule,
 * so it's safe to call inside the same transaction as the sale that might
 * trigger it — DB writes only, no email (see sendLoyaltyCardEmail below,
 * called after commit, same "side effects after commit" shape as every
 * other post-transaction hook in this codebase).
 */
export async function evaluateAndIssuePatronageCard(ctx, customer, business, session) {
  const rule = business.settings?.loyaltyRule;
  if (!rule || rule.mode === "off" || !rule.threshold) return null;

  const alreadyHasCard = await LoyaltyCard.exists({ businessId: ctx.businessId, customerId: customer._id, status: "active" }).session(session || null);
  if (alreadyHasCard) return null;

  let qualifies = false;
  if (rule.mode === "visits") {
    if (!rule.windowDays) {
      qualifies = customer.visits >= rule.threshold;
    } else {
      const cutoff = new Date(Date.now() - rule.windowDays * 24 * 3600 * 1000);
      const count = await Sale.countDocuments({
        businessId: ctx.businessId, customerId: customer._id, status: "completed", at: { $gte: cutoff },
      }).session(session || null);
      qualifies = count >= rule.threshold;
    }
  } else if (rule.mode === "spend") {
    if (!rule.windowDays) {
      qualifies = customer.totalSpend >= rule.threshold;
    } else {
      const cutoff = new Date(Date.now() - rule.windowDays * 24 * 3600 * 1000);
      const [agg] = await Sale.aggregate([
        { $match: { businessId: ctx.businessId, customerId: customer._id, status: "completed", at: { $gte: cutoff } } },
        { $group: { _id: null, spend: { $sum: "$total" } } },
      ]).session(session || null);
      qualifies = (agg?.spend || 0) >= rule.threshold;
    }
  }

  if (!qualifies) return null;
  return issueCardForCustomer(ctx, customer._id, "patronage", session);
}

/** Card view URL a QR encodes / a WhatsApp share links to. */
export function loyaltyCardUrl(req, code) {
  const origin = `${req.protocol}://${req.get("host")}`;
  return `${origin}/loyalty/${code}`;
}

/**
 * Emails the card as a QR image. A customer never has an email on file
 * (CRM-lite — see Customer model), so every caller of this is either a
 * staff member typing one in on the spot, or a future feature with its own
 * source of an address — never something read off the customer record.
 */
export async function sendLoyaltyCardEmail({ to, customerName, businessName, cardUrl }) {
  if (!to) return { sent: false, reason: "no_address" };
  try {
    const qrDataUrl = await QRCode.toDataURL(cardUrl, { margin: 1, width: 220 });
    return await sendMail({
      to,
      subject: `Your ${businessName} loyalty card`,
      html: emailShell({
        businessName,
        heading: "Here's your loyalty card",
        intro: `Hi ${esc(customerName)}, thanks for being a regular! Show this QR code at the till on your next visit for your discount.`,
        sections: [`<div style="text-align:center;margin:16px 0"><img src="${qrDataUrl}" width="220" height="220" alt="Loyalty QR code" /></div>`],
        footNote: `Keep this email or save the code — you can also open it directly: ${esc(cardUrl)}`,
      }),
    });
  } catch (err) {
    console.error("sendLoyaltyCardEmail failed:", err.message);
    return { sent: false, reason: err.message };
  }
}
