import { Router } from "express";
import { z } from "zod";
import { Customer } from "#modules/customers/customer.model.js";
import { requirePerm } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const loyaltyRouter = Router();

// Falls back to Stacey Fountain's own seeded numbers when a business hasn't
// touched this screen — see business.model.js's schema defaults, mirrored
// here so a legacy document (loyalty sub-object entirely absent) still works.
function loyaltyConfig(business) {
  return {
    sachetBagsPerToken: business.settings?.loyalty?.sachetBagsPerToken || 2,
    tokensPerFreePack: business.settings?.loyalty?.tokensPerFreePack || 5,
  };
}

function tokenStatus(customer, config) {
  const tokens = Math.floor((customer.sachetBagQty || 0) / config.sachetBagsPerToken);
  const redeemable = Math.floor((tokens - (customer.tokensRedeemed || 0)) / config.tokensPerFreePack);
  return { sachetBagQty: customer.sachetBagQty || 0, tokens, tokensRedeemed: customer.tokensRedeemed || 0, redeemable: Math.max(0, redeemable) };
}

// GET /api/loyalty/schedule — every scheduled customer, bucketed. Registered
// before /:customerId so "schedule" is never swallowed as a customer id.
loyaltyRouter.get("/schedule", requirePerm("customers", "sales"), async (req, res) => {
  const customers = await Customer.find({
    businessId: req.ctx.businessId,
    "supplySchedule.interval": { $ne: "none" },
  }).select("name phone supplySchedule");

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 3600 * 1000);

  const buckets = { overdue: [], dueToday: [], upcoming: [] };
  for (const c of customers) {
    const due = c.supplySchedule?.nextDueAt ? new Date(c.supplySchedule.nextDueAt) : null;
    const row = { id: c._id, name: c.name, phone: c.phone, interval: c.supplySchedule.interval, nextDueAt: due };
    if (!due) continue;
    if (due < startOfToday) buckets.overdue.push(row);
    else if (due < startOfTomorrow) buckets.dueToday.push(row);
    else buckets.upcoming.push(row);
  }
  for (const k of Object.keys(buckets)) buckets[k].sort((a, b) => a.nextDueAt - b.nextDueAt);
  res.json(buckets);
});

// GET /api/loyalty/:customerId — tokens earned, spent, redeemable now, and
// the customer's supply schedule (everything this widget needs in one call).
loyaltyRouter.get("/:customerId", requirePerm("customers", "sales"), async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.customerId, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });
  res.json({
    customerId: customer._id,
    customerName: customer.name,
    ...tokenStatus(customer, loyaltyConfig(req.ctx.business)),
    supplySchedule: customer.supplySchedule || { interval: "none", nextDueAt: null },
  });
});

// POST /api/loyalty/:customerId/redeem — whole batches only; no partial free
// pack, and redeemed tokens are marked spent so they can never be redeemed
// twice.
loyaltyRouter.post("/:customerId/redeem", requirePerm("customers", "sales"), async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.customerId, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });

  const config = loyaltyConfig(req.ctx.business);
  const status = tokenStatus(customer, config);
  if (status.redeemable < 1) {
    return res.status(400).json({ error: "nothing_to_redeem", message: "Not enough tokens for a free pack yet." });
  }

  const spent = status.redeemable * config.tokensPerFreePack;
  customer.tokensRedeemed = (customer.tokensRedeemed || 0) + spent;
  await customer.save();

  audit(req.ctx, "loyalty.redeem", { type: "customer", id: customer._id, label: customer.name }, undefined, {
    freePacks: status.redeemable, tokensSpent: spent,
  });
  res.json({ freePacks: status.redeemable, ...tokenStatus(customer, config) });
});

const scheduleSchema = z.object({
  interval: z.enum(["none", "daily", "weekly", "biweekly", "monthly"]),
  nextDueAt: z.string().optional(), // "YYYY-MM-DD"; defaults to today when going from "none"
});

// PATCH /api/loyalty/:customerId/schedule — put a customer on (or take them
// off) a recurring supply schedule.
loyaltyRouter.patch("/:customerId/schedule", requirePerm("customers", "sales"), async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const { interval, nextDueAt } = parsed.data;

  const customer = await Customer.findOne({ _id: req.params.customerId, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });

  customer.supplySchedule = {
    interval,
    nextDueAt: interval === "none" ? null : nextDueAt ? new Date(nextDueAt) : new Date(),
  };
  await customer.save();
  res.json({ customerId: customer._id, supplySchedule: customer.supplySchedule });
});

function rollForward(date, interval) {
  const d = new Date(date);
  if (interval === "daily") d.setDate(d.getDate() + 1);
  else if (interval === "weekly") d.setDate(d.getDate() + 7);
  else if (interval === "biweekly") d.setDate(d.getDate() + 14);
  else if (interval === "monthly") d.setMonth(d.getMonth() + 1);
  return d;
}

// POST /api/loyalty/:customerId/supplied — mark a scheduled customer
// supplied; rolls next-due forward by exactly one interval.
loyaltyRouter.post("/:customerId/supplied", requirePerm("customers", "sales"), async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.customerId, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });
  if (!customer.supplySchedule?.interval || customer.supplySchedule.interval === "none") {
    return res.status(400).json({ error: "no_schedule", message: "This customer isn't on a supply schedule." });
  }

  const from = customer.supplySchedule.nextDueAt || new Date();
  customer.supplySchedule.nextDueAt = rollForward(from, customer.supplySchedule.interval);
  await customer.save();
  audit(req.ctx, "loyalty.supplied", { type: "customer", id: customer._id, label: customer.name }, undefined, {
    nextDueAt: customer.supplySchedule.nextDueAt,
  });
  res.json({ customerId: customer._id, supplySchedule: customer.supplySchedule });
});
