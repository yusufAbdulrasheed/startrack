import { Router } from "express";
import { Sale } from "#modules/sales/sale.model.js";
import { Business } from "#modules/business/business.model.js";
import { Account } from "#modules/auth/account.model.js";
import { allow } from "#core/rateLimit.js";
import { planStatus } from "#shared/plans.js";
import { buildReceipt, saleIdFromToken } from "#modules/sales/receipt.js";

/**
 * /api/public/receipts/:token — the receipt a customer opens from a WhatsApp
 * message. No login: the signed token is the key. It returns the receipt as
 * printed, and nothing else (no ids, no cost, no customer phone).
 */
export const receiptPublicRouter = Router();

receiptPublicRouter.get("/:token", async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "x";
  if (!allow(res, `receipt:${ip}`, { max: 90, windowMs: 60_000 })) return;
  const id = saleIdFromToken(req.params.token);
  const sale = id ? await Sale.findById(id) : null;
  const business = sale ? await Business.findById(sale.businessId) : null;
  if (!sale || !business) return res.status(404).json({ error: "not_found", message: "This receipt isn't available." });
  const account = await Account.findById(business.accountId).select("isSandbox subscription status");
  const receipt = buildReceipt({ business, plan: planStatus(account).plan, sale });
  res.set("Cache-Control", "no-store");
  res.json({ receipt, voided: sale.status === "voided" });
});
