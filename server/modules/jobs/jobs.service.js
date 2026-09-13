import { Product } from "#modules/products/product.model.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { money } from "#core/money.js";
import { badRequest } from "#core/httpError.js";

/**
 * Pricing a job. Same rules as a sale — the server decides what things cost,
 * the client only says what and how many — but split by kind, because parts
 * come out of stock and labour does not.
 */
export async function priceLines(ctx, rawLines, session = null) {
  if (!rawLines?.length) return { lines: [], subtotal: 0 };

  const productIds = rawLines.filter((l) => l.productId).map((l) => l.productId);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, businessId: ctx.businessId, status: "active" }).session(session)
    : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const lines = rawLines.map((l) => {
    if (l.productId) {
      const p = byId.get(String(l.productId));
      if (!p) throw badRequest("One of those products no longer exists.");
      // A stocked product is a part; anything else on the catalog priced as
      // work (a service line) is labour and never touches inventory.
      const kind = p.archetype === "made_to_order" ? "labour" : (l.kind === "labour" ? "labour" : "part");
      return {
        productId: p._id,
        name: p.name,
        kind,
        qty: l.qty,
        unitPrice: l.price !== undefined ? money(l.price) : p.price,
        lineCost: money((p.cost || 0) * l.qty),
        lineNet: money((l.price !== undefined ? money(l.price) : p.price) * l.qty),
      };
    }
    // A free-text line: labour, a callout, a one-off charge.
    if (!l.name?.trim()) throw badRequest("Every line needs a description.");
    if (l.price === undefined) throw badRequest(`Give "${l.name}" a price.`);
    return {
      name: l.name.trim(),
      kind: "labour",
      qty: l.qty,
      unitPrice: money(l.price),
      lineCost: money((l.cost || 0) * l.qty),
      lineNet: money(money(l.price) * l.qty),
    };
  });

  return { lines, subtotal: money(lines.reduce((s, l) => s + l.lineNet, 0)) };
}

/** Applies the business's VAT and discount rules to a priced job. */
export function totalsFor(business, subtotal, discountInput = 0) {
  const discount = money(Math.min(discountInput, subtotal));
  const settings = business.settings || {};
  const vat = settings.vatEnabled ? money(((subtotal - discount) * settings.vatRate) / 100) : 0;
  return { subtotal: money(subtotal), discount, vat, total: money(subtotal - discount + vat) };
}

/**
 * Takes the job's parts out of stock. Called when work actually starts, not
 * when the ticket is written — a car sitting in the queue has not consumed
 * anything yet, and reserving stock it may never use would hide it from
 * everyone else.
 */
export async function consumeParts(ctx, job, session = null) {
  const parts = job.lines.filter((l) => l.kind === "part" && l.productId && l.qty > 0);
  for (const part of parts) {
    await applyMovement(ctx, {
      branchId: job.branchId,
      productId: part.productId,
      productName: part.name,
      type: "OUT",
      qty: -part.qty,
      refType: "job",
      refId: job._id,
      reason: `Job ${job.jobNo}`,
      session,
    });
  }
  return parts.length;
}

/** Puts the parts back — a cancelled job returns what it took. */
export async function restoreParts(ctx, job, session = null) {
  const parts = job.lines.filter((l) => l.kind === "part" && l.productId && l.qty > 0);
  for (const part of parts) {
    await applyMovement(ctx, {
      branchId: job.branchId,
      productId: part.productId,
      productName: part.name,
      type: "RETURN",
      qty: part.qty,
      refType: "job",
      refId: job._id,
      reason: `Job ${job.jobNo} cancelled`,
      session,
    });
  }
  return parts.length;
}

export const shapeJob = (j, showCost = false) => ({
  id: j._id,
  jobNo: j.jobNo,
  title: j.title,
  reference: j.reference,
  serialNo: j.serialNo || "",
  notes: j.notes,
  stage: j.stage,
  customerId: j.customerId || null,
  customerName: j.customerName,
  customerPhone: j.customerPhone,
  lines: j.lines.map((l) => ({
    productId: l.productId || null,
    name: l.name,
    kind: l.kind,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineNet: l.lineNet,
    ...(showCost ? { lineCost: l.lineCost } : {}),
  })),
  subtotal: j.subtotal,
  discount: j.discount,
  vat: j.vat,
  total: j.total,
  deposit: j.deposit,
  depositMethod: j.depositMethod,
  balance: money(j.total - j.deposit),
  promisedAt: j.promisedAt || null,
  receivedAt: j.receivedAt,
  readyAt: j.readyAt || null,
  collectedAt: j.collectedAt || null,
  staffName: j.staffName,
  partsConsumed: j.partsConsumed,
  saleId: j.saleId || null,
  stageHistory: j.stageHistory.map((h) => ({ stage: h.stage, at: h.at, byName: h.byName, note: h.note })),
  // Everything the counter needs to know at a glance.
  overdue: !!j.promisedAt && j.stage !== "collected" && j.stage !== "cancelled" && new Date(j.promisedAt) < new Date(),
});
