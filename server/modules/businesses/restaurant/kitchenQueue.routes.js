import { Router } from "express";
import { z } from "zod";
import { Sale } from "#modules/sales/sale.model.js";
import { requirePerm, requireBranch } from "#core/middleware/tenant.js";
import { audit } from "#core/audit.js";

export const kitchenQueueRouter = Router();

// GET /api/kitchen-queue — every not-yet-served item across recent sales,
// flattened into one oldest-first ticket list. A sale's other lines (drinks
// already carried out, say) never got a prepStatus at all if this business
// doesn't have kitchenQueue — nothing to flatten for anyone else.
kitchenQueueRouter.get("/", requirePerm("sales", "dashboard_ops"), requireBranch, async (req, res) => {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000); // today's shift, roughly
  const sales = await Sale.find({
    businessId: req.ctx.businessId,
    branchId: req.ctx.branchId,
    status: "completed",
    at: { $gte: since },
    "items.prepStatus": { $exists: true, $ne: "served" },
  }).sort({ at: 1 }).select("saleNo at items");

  const tickets = [];
  for (const sale of sales) {
    sale.items.forEach((item, index) => {
      if (item.prepStatus && item.prepStatus !== "served") {
        tickets.push({
          saleId: sale._id, saleNo: sale.saleNo, itemIndex: index,
          name: item.name, qty: item.qty, prepStatus: item.prepStatus, at: sale.at,
        });
      }
    });
  }
  res.json({ tickets });
});

const updateSchema = z.object({
  prepStatus: z.enum(["pending", "preparing", "ready", "served"]),
});

// PATCH /api/kitchen-queue/:saleId/items/:index — advance one line's status
kitchenQueueRouter.patch("/:saleId/items/:index", requirePerm("sales"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });

  const index = Number(req.params.index);
  const sale = await Sale.findOne({ _id: req.params.saleId, businessId: req.ctx.businessId });
  if (!sale) return res.status(404).json({ error: "not_found", message: "Sale not found." });
  const item = sale.items[index];
  if (!item || item.prepStatus === undefined) {
    return res.status(404).json({ error: "not_found", message: "That line isn't on the kitchen queue." });
  }

  item.prepStatus = parsed.data.prepStatus;
  await sale.save();
  audit(req.ctx, "kitchen.advance", { type: "sale", id: sale._id, label: sale.saleNo }, undefined, {
    item: item.name, prepStatus: item.prepStatus,
  });
  res.json({ saleId: sale._id, itemIndex: index, prepStatus: item.prepStatus });
});
