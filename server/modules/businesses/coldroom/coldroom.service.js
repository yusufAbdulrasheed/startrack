import { ColdRoomBatch } from "#modules/businesses/coldroom/batch.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { applyMovement } from "#modules/inventory/inventory.service.js";
import { money } from "#core/money.js";

/** A batch's cost basis per kg, from its own carton price — never a blend. */
export const costPerKgOfBatch = (b) => (b.packSizeKg ? money(b.unitCostPerCarton / b.packSizeKg) : 0);
export const costPerPieceOfBatch = (b) => (b.avgPieceWeightKg ? money(costPerKgOfBatch(b) * b.avgPieceWeightKg) : 0);

/** One product's true on-hand picture, summed across every open batch. */
export function poolsFromBatches(batches) {
  let sealedCartons = 0, looseKg = 0, loosePieces = 0, cartonEquivalent = 0, stockValue = 0;
  for (const b of batches) {
    sealedCartons += b.remainingCartons;
    looseKg += b.remainingKg;
    loosePieces += b.remainingPieces;
    // Loose kg AND counted pieces both have to count toward the carton
    // equivalent — a breakdown that cut a carton into pieces instead of
    // leaving it as loose kg didn't make that weight disappear. Omitting the
    // piece pool here would make syncCartonEquivalentStock read every such
    // breakdown as pure shrinkage, which it isn't.
    cartonEquivalent +=
      b.remainingCartons +
      (b.packSizeKg ? b.remainingKg / b.packSizeKg : 0) +
      (b.packSizeKg && b.avgPieceWeightKg ? (b.remainingPieces * b.avgPieceWeightKg) / b.packSizeKg : 0);
    stockValue += b.remainingCartons * b.unitCostPerCarton + b.remainingKg * costPerKgOfBatch(b) + b.remainingPieces * costPerPieceOfBatch(b);
  }
  return {
    sealedCartons: money(sealedCartons), looseKg: money(looseKg), loosePieces,
    cartonEquivalent: money(cartonEquivalent), stockValue: money(stockValue),
  };
}

/**
 * Forces the generic Product/Inventory ledger's carton-equivalent number
 * back into agreement with the true total across this product's open
 * batches — a reconciliation, not an incremental guess. Every batch-mutating
 * route (purchase, breakdown, sale, cold-chain loss) calls this once after
 * it finishes, so Inventory.stock can never drift from what the batches
 * actually say, however many operations happen between physical stock counts.
 *
 * `wasteReasonIfLoss` tags the movement as waste (with that reason) only
 * when the recomputed total came out LOWER than before — a sale or an
 * ordinary purchase should never be mistaken for a loss.
 */
export async function syncCartonEquivalentStock(
  ctx,
  branchId,
  product,
  { refType = "manual", refId = null, reason = "", wasteReasonIfLoss, unitCost, supplierId, supplierName, session = null } = {}
) {
  const batches = await ColdRoomBatch.find({ businessId: ctx.businessId, branchId, productId: product._id, status: "open" }).session(session);
  const { cartonEquivalent: trueTotal } = poolsFromBatches(batches);
  const inv = await Inventory.findOne({ branchId, productId: product._id }).session(session);
  const current = inv?.stock ?? 0;
  const delta = money(trueTotal - current);
  if (Math.abs(delta) < 0.005) return current;

  return applyMovement(ctx, {
    branchId,
    productId: product._id,
    productName: product.name,
    type: delta > 0 ? "IN" : "OUT",
    qty: delta,
    refType: delta < 0 && wasteReasonIfLoss ? "waste" : refType,
    refId,
    reason,
    ...(delta < 0 && wasteReasonIfLoss ? { wasteReason: wasteReasonIfLoss } : {}),
    ...(unitCost !== undefined ? { unitCost } : {}),
    ...(supplierId ? { supplierId, supplierName } : {}),
    session,
  });
}

/** FIFO queue for a product: oldest open batch first. */
export async function openBatchesFifo(businessId, branchId, productId, session = null) {
  return ColdRoomBatch.find({ businessId, branchId, productId, status: "open" }).sort({ purchaseDate: 1 }).session(session);
}

/** Closes a batch once every pool has been drawn down to (near) nothing. */
export function maybeCloseBatch(batch) {
  if (batch.remainingCartons <= 0.001 && batch.remainingKg <= 0.001 && batch.remainingPieces <= 0) {
    batch.status = "closed";
  }
}

export function shapeBatch(b) {
  return {
    id: b._id,
    productId: b.productId,
    productName: b.productName,
    supplierId: b.supplierId || null,
    supplierName: b.supplierName || "",
    purchaseDate: b.purchaseDate,
    cartonsReceived: b.cartonsReceived,
    packSizeKg: b.packSizeKg,
    unitCostPerCarton: b.unitCostPerCarton,
    costPerKg: costPerKgOfBatch(b),
    actualWeighedKg: b.actualWeighedKg ?? null,
    remainingCartons: b.remainingCartons,
    remainingKg: b.remainingKg,
    remainingPieces: b.remainingPieces,
    avgPieceWeightKg: b.avgPieceWeightKg || 0,
    status: b.status,
    notes: b.notes,
    createdAt: b.createdAt,
  };
}

export function shapeBreakdown(e) {
  return {
    id: e._id,
    batchId: e.batchId,
    productId: e.productId,
    productName: e.productName,
    cartonsOpened: e.cartonsOpened,
    expectedYieldKg: e.expectedYieldKg,
    actualWeighedKg: e.actualWeighedKg,
    varianceKg: e.varianceKg,
    variancePercent: e.variancePercent,
    resultingPieceCount: e.resultingPieceCount || null,
    byName: e.byName,
    note: e.note,
    at: e.at,
  };
}
