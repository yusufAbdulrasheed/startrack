/**
 * Water — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import mongoose from "mongoose";
import { seedImage as img, applyMovement, applyCreditChange, nextSeq, money, pick, daysAgo } from "#platform/index.js";
import { ProductionRun } from "./production/productionRun.model.js";

const shop = {
  label: "Water Factory", group: "Production", depth: "full",
  pending: "Production runs are real — open Production, define a recipe (preform/caps/labels → a bottled pack) and record a run to see raw materials deducted and finished stock credited, leakage included.",
  blurb: "Sachets and bottles, with the raw materials they are made from.",
  business: "AquaPure Table Water",
  branch: { name: "Factory", address: "Km 4 Old Aba Road, Port Harcourt" },
  highlight: "Raw materials and finished goods side by side",
  catalog: [
    { name: "Preform 50cl (piece)", category: "Raw Materials", price: 26, cost: 22, stock: 8000, reorder: 3000, image: img("plastic,bottle", 62) },
    { name: "Bottle Cap (piece)", category: "Raw Materials", price: 5, cost: 4, stock: 9500, reorder: 3000, image: img("bottle,cap", 63) },
    { name: "Shrink Label (piece)", category: "Raw Materials", price: 4, cost: 3, stock: 2100, reorder: 3000, image: img("label,roll", 64) },
    { name: "Sachet Film (roll)", category: "Raw Materials", price: 32000, cost: 27000, stock: 6, reorder: 4, image: img("plastic,roll", 65) },
    { name: "Treatment Chemicals (pack)", category: "Raw Materials", price: 18000, cost: 14500, stock: 3, reorder: 4, image: img("chemicals,lab", 66) },
    { name: "Sachet Water (bag of 20)", category: "Sachets", price: 350, cost: 210, stock: 240, reorder: 100, image: img("water,bag", 67) },
    { name: "Bottled Water 50cl (pack of 12)", category: "Bottles", price: 1800, cost: 1150, stock: 96, reorder: 40, image: img("bottled,water", 68) },
    { name: "Bottled Water 75cl (pack of 12)", category: "Bottles", price: 2600, cost: 1700, stock: 48, reorder: 30, image: img("bottled,water", 69) },
    { name: "19L Dispenser Bottle", category: "Dispensers", price: 4500, cost: 3000, stock: 22, reorder: 15, image: img("water,dispenser", 70) },
    { name: "Dispenser Refill 19L", category: "Dispensers", price: 1800, cost: 900, stock: 60, reorder: 30, image: img("water,dispenser", 71) },
    { name: "Preform 75cl (piece)", category: "Raw Materials", price: 34, cost: 28, stock: 6000, reorder: 2500, image: img("plastic,bottle", 72) },
    { name: "Bottle Cap Large (piece)", category: "Raw Materials", price: 6, cost: 5, stock: 7000, reorder: 2500, image: img("bottle,cap", 73) },
    { name: "Carton Box (piece)", category: "Raw Materials", price: 120, cost: 95, stock: 1500, reorder: 500, image: img("cardboard,box", 74) },
    { name: "UV Sterilizer Lamp", category: "Raw Materials", price: 45000, cost: 38000, stock: 2, reorder: 2, image: img("uv,lamp", 75) },
    { name: "Sachet Water (bag of 30)", category: "Sachets", price: 480, cost: 300, stock: 180, reorder: 80, image: img("water,bag", 76) },
    { name: "Bottled Water 100cl (pack of 12)", category: "Bottles", price: 3200, cost: 2200, stock: 60, reorder: 25, image: img("bottled,water", 77) },
    { name: "Bottled Water 150cl (pack of 6)", category: "Bottles", price: 2800, cost: 1900, stock: 40, reorder: 20, image: img("bottled,water", 78) },
    { name: "19L Dispenser Bottle (returnable deposit)", category: "Dispensers", price: 1000, cost: 0, stock: 30, reorder: 10, image: img("water,dispenser", 79) },
    { name: "Dispenser Stand", category: "Dispensers", price: 8500, cost: 5500, stock: 10, reorder: 5, image: img("water,cooler", 80) },
    { name: "Table Top Dispenser", category: "Dispensers", price: 22000, cost: 16500, stock: 6, reorder: 3, image: img("water,dispenser", 81) },
  ],
};

async function seedWaterProduction(ctx, byName) {
  const pack = byName.get("Bottled Water 50cl (pack of 12)")?.doc;
  const preform = byName.get("Preform 50cl (piece)")?.doc;
  const cap = byName.get("Bottle Cap (piece)")?.doc;
  const label = byName.get("Shrink Label (piece)")?.doc;
  if (!pack || !preform || !cap || !label) return;

  pack.bom = [
    { productId: preform._id, per: "unit", factor: 12, includeLeakage: true },
    { productId: cap._id, per: "unit", factor: 12, includeLeakage: true },
    { productId: label._id, per: "unit", factor: 12, includeLeakage: true },
  ];
  pack.producedUnitsPerStockUnit = 12;
  await pack.save();

  const producedUnits = 120, leakage = 3, yieldPer = 12;
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const components = pack.bom.map((line) => {
    const comp = [preform, cap, label].find((c) => String(c._id) === String(line.productId));
    return { productId: comp._id, name: comp.name, qty: round3(line.factor * (producedUnits + leakage)), includedLeakage: true };
  });
  const creditedQty = Math.floor(producedUnits / yieldPer);
  const runId = new mongoose.Types.ObjectId();
  for (const c of components) {
    await applyMovement(ctx, { branchId: ctx.branchId, productId: c.productId, productName: c.name, type: "OUT", qty: -c.qty, refType: "production", refId: runId, reason: `Used for production run of ${pack.name}` });
  }
  await applyMovement(ctx, { branchId: ctx.branchId, productId: pack._id, productName: pack.name, type: "IN", qty: creditedQty, refType: "production", refId: runId, reason: `Production run — ${producedUnits} unit(s), ${leakage} leakage` });
  const seq = await nextSeq(`run:${ctx.branchId}`);
  await ProductionRun.create({
    _id: runId, accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, runNo: `PR-${String(seq).padStart(5, "0")}`,
    productId: pack._id, productName: pack.name, producedUnits, leakage, creditedQty, producedUnitsPerStockUnit: yieldPer,
    components, note: "Morning bottling run", staffName: ctx.actorName, at: daysAgo(2),
  });
}

async function seedCreditCustomer(ctx, customers) {
  const debtor = customers[0];
  await applyCreditChange(ctx, { customer: debtor, type: "sale", amount: money(pick([4500, 6200, 8900])), refType: "manual", note: "Supplied on trust, pays end of week" });
}

export const demo = {
  shop,
  // A bottling run (raw materials in, packs out, leakage measured) and a customer on credit.
  async seed({ ctx, byName, customers }) {
    await seedWaterProduction(ctx, byName);
    await seedCreditCustomer(ctx, customers);
  },
};
