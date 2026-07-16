import { Router } from "express";
import { z } from "zod";
import { Customer } from "../models/Customer.js";
import { Sale } from "../models/Sale.js";
import { requirePerm } from "../middleware/tenant.js";

export const customersRouter = Router();

function shape(c) {
  return {
    id: c._id,
    name: c.name,
    phone: c.phone,
    whatsapp: c.whatsapp,
    notes: c.notes,
    totalSpend: c.totalSpend,
    visits: c.visits,
    firstSeen: c.firstSeen,
    lastSeen: c.lastSeen,
  };
}

// GET /api/customers?q=
customersRouter.get("/", requirePerm("customers", "sales"), async (req, res) => {
  const filter = { businessId: req.ctx.businessId };
  if (req.query.q) {
    const q = String(req.query.q).trim();
    filter.$or = [{ name: { $regex: q, $options: "i" } }, { phone: { $regex: q } }];
  }
  const customers = await Customer.find(filter).sort({ lastSeen: -1 }).limit(200);
  res.json({ customers: customers.map(shape) });
});

const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().default(""),
  whatsapp: z.string().default(""),
  notes: z.string().default(""),
});

// POST /api/customers
customersRouter.post("/", requirePerm("customers", "sales"), async (req, res) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  const d = parsed.data;

  if (d.phone) {
    const dupe = await Customer.findOne({ businessId: req.ctx.businessId, phone: d.phone });
    if (dupe) return res.status(409).json({ error: "phone_taken", message: `${dupe.name} already has that phone number.` });
  }

  const customer = await Customer.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    ...d,
    whatsapp: d.whatsapp || d.phone,
  });
  res.status(201).json({ customer: shape(customer) });
});

// PATCH /api/customers/:id
customersRouter.patch("/:id", requirePerm("customers"), async (req, res) => {
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const customer = await Customer.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });
  Object.assign(customer, parsed.data);
  await customer.save();
  res.json({ customer: shape(customer) });
});

// GET /api/customers/:id — profile + purchase history
customersRouter.get("/:id", requirePerm("customers"), async (req, res) => {
  const customer = await Customer.findOne({ _id: req.params.id, businessId: req.ctx.businessId });
  if (!customer) return res.status(404).json({ error: "not_found", message: "Customer not found." });
  const sales = await Sale.find({ businessId: req.ctx.businessId, customerId: customer._id })
    .sort({ at: -1 })
    .limit(25)
    .select("saleNo at total status items.name items.qty");
  res.json({
    customer: shape(customer),
    sales: sales.map((s) => ({
      id: s._id,
      saleNo: s.saleNo,
      at: s.at,
      total: s.total,
      status: s.status,
      summary: s.items.map((i) => `${i.name} ×${i.qty}`).join(", "),
    })),
  });
});
