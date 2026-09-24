import { Router } from "express";
import { Product } from "#modules/products/product.model.js";
import { Customer } from "#modules/customers/customer.model.js";
import { Sale } from "#modules/sales/sale.model.js";
import { Expense } from "#modules/expenses/expense.model.js";
import { Membership } from "#modules/auth/membership.model.js";
import { User } from "#modules/auth/user.model.js";

export const searchRouter = Router();

const escapeRegex = (s) => String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One box, everything in it. Each domain is queried only if the caller
 * actually has the permission its real page requires — this endpoint
 * combines results from several collections in one response, so unlike a
 * normal route it can't lean on a single requirePerm() gate; each branch
 * below re-implements the same check that domain's own router already
 * enforces (see products/customers/sales/staff/expenses routes).
 *
 * Every result carries the `route` its owning page already knows how to
 * filter down to (Products/Customers/?q=, Sales/?saleNo=) — see
 * public/components/layout/GlobalSearch.tsx, the one place this is called.
 */
searchRouter.get("/", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: [] });

  const { businessId, branchId, perms } = req.ctx;
  const can = (p) => perms.includes("*") || perms.includes(p);
  const rx = { $regex: escapeRegex(q), $options: "i" };
  const tasks = [];

  if (can("stock")) {
    tasks.push(
      Product.find({ businessId, status: "active", $or: [{ name: rx }, { barcode: rx }, { sku: rx }] })
        .select("name category price")
        .limit(5)
        .then((rows) =>
          rows.map((p) => ({
            category: "product", id: String(p._id), label: p.name,
            meta: { category: p.category, price: p.price },
            route: `/app/products?q=${encodeURIComponent(p.name)}`,
          }))
        )
    );
  }

  if (can("customers")) {
    tasks.push(
      Customer.find({ businessId, $or: [{ name: rx }, { phone: rx }] })
        .select("name phone")
        .limit(5)
        .then((rows) =>
          rows.map((c) => ({
            category: "customer", id: String(c._id), label: c.name,
            meta: { phone: c.phone },
            route: `/app/customers?q=${encodeURIComponent(c.name)}`,
          }))
        )
    );
  }

  if (branchId && (can("sales") || can("dashboard_ops"))) {
    tasks.push(
      Sale.find({ businessId, branchId, $or: [{ saleNo: rx }, { customerName: rx }] })
        .select("saleNo total at customerName")
        .sort({ at: -1 })
        .limit(5)
        .then((rows) =>
          rows.map((s) => ({
            category: "sale", id: String(s._id), label: s.saleNo,
            meta: { total: s.total, at: s.at, customerName: s.customerName },
            route: `/app/sales?saleNo=${encodeURIComponent(s.saleNo)}`,
          }))
        )
    );
  }

  if (can("staff_mgmt")) {
    tasks.push(
      (async () => {
        const users = await User.find({ name: rx }).select("_id name").limit(20);
        if (!users.length) return [];
        const memberships = await Membership.find({
          businessId, status: "active", userId: { $in: users.map((u) => u._id) },
        }).limit(5);
        const nameById = new Map(users.map((u) => [String(u._id), u.name]));
        return memberships.map((m) => ({
          category: "staff", id: String(m._id), label: nameById.get(String(m.userId)) || "Staff",
          meta: { role: m.role },
          route: "/app/staff",
        }));
      })()
    );
  }

  if (branchId && can("expenses")) {
    tasks.push(
      Expense.find({ businessId, branchId, type: rx })
        .sort({ at: -1 })
        .limit(5)
        .then((rows) =>
          rows.map((e) => ({
            category: "expense", id: String(e._id), label: e.type,
            meta: { amount: e.amount, at: e.at },
            route: "/app/expenses",
          }))
        )
    );
  }

  const grouped = await Promise.all(tasks);
  res.json({ results: grouped.flat() });
});
