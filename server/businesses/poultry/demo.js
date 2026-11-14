/**
 * Poultry — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import { seedImage as img, inDays, applyMovement, daysAgo } from "#platform/index.js";
import { Cohort } from "./cohort.model.js";

const shop = {
  label: "Poultry Farm", group: "Production", depth: "full",
  pending: "Batch/flock tracking is real — open Batches, start one, and feed/mortality/harvest against it. No demo batch is pre-seeded, so today's catalog shows feed and produce as plain stock.",
  blurb: "Feed, birds and eggs, with feed running low.",
  business: "Green Acres Poultry",
  branch: { name: "Farm", address: "Ilesa-Akure Road, Osun" },
  highlight: "Feed stock already below its reorder level",
  catalog: [
    { name: "Layer Mash (25kg bag)", category: "Feed", price: 19500, cost: 16800, stock: 8, reorder: 20, image: img("chicken,feed", 82) },
    { name: "Broiler Starter (25kg bag)", category: "Feed", price: 22000, cost: 19000, stock: 14, reorder: 20, image: img("chicken,feed", 83) },
    { name: "Grower Feed (25kg bag)", category: "Feed", price: 20500, cost: 17600, stock: 26, reorder: 15, image: img("poultry,feed", 84) },
    { name: "Crate of Eggs (30)", category: "Eggs", price: 5200, cost: 3400, stock: 88, reorder: 30, expiry: inDays(18), image: img("eggs,crate", 85) },
    { name: "Cracked Eggs (crate)", category: "Eggs", price: 3200, cost: 3400, stock: 6, reorder: 0, expiry: inDays(10), image: img("eggs,carton", 86) },
    { name: "Live Broiler (bird)", category: "Birds", price: 9500, cost: 6800, stock: 120, reorder: 40, image: img("broiler,chicken", 87) },
    { name: "Old Layer (spent bird)", category: "Birds", price: 6500, cost: 4200, stock: 34, reorder: 0, image: img("hen,chicken", 88) },
    { name: "Day-old Chick", category: "Birds", price: 1400, cost: 1050, stock: 0, reorder: 100, image: img("chick,baby", 89) },
    { name: "Newcastle Vaccine (vial)", category: "Medication", price: 4800, cost: 3600, stock: 5, reorder: 6, expiry: inDays(40), image: img("vaccine,vial", 90) },
    { name: "Multivitamin Powder", category: "Medication", price: 3500, cost: 2400, stock: 11, reorder: 8, expiry: inDays(150), image: img("vitamins,powder", 91) },
    { name: "Drinker (5L)", category: "Equipment", price: 4200, cost: 2800, stock: 18, reorder: 10, image: img("chicken,farm", 92) },
    { name: "Finisher Feed (25kg bag)", category: "Feed", price: 21000, cost: 18200, stock: 20, reorder: 15, image: img("poultry,feed", 93) },
    { name: "Chick Starter Mash (25kg bag)", category: "Feed", price: 20000, cost: 17200, stock: 15, reorder: 15, image: img("chick,feed", 94) },
    { name: "Live Layer (bird)", category: "Birds", price: 7500, cost: 5200, stock: 60, reorder: 20, image: img("hen,chicken", 95) },
    { name: "Point-of-Lay Pullet", category: "Birds", price: 4500, cost: 3200, stock: 40, reorder: 15, image: img("chicken,farm", 96) },
    { name: "Cracked Maize (25kg bag)", category: "Feed", price: 12000, cost: 9800, stock: 10, reorder: 10, image: img("maize,corn", 97) },
    { name: "Gumboro Vaccine (vial)", category: "Medication", price: 5200, cost: 3900, stock: 4, reorder: 6, expiry: inDays(50), image: img("vaccine,vial", 98) },
    { name: "Dewormer (bottle)", category: "Medication", price: 3200, cost: 2200, stock: 9, reorder: 6, expiry: inDays(200), image: img("medicine,bottle", 99) },
    { name: "Feeder (10kg)", category: "Equipment", price: 5200, cost: 3600, stock: 14, reorder: 8, image: img("chicken,feeder", 100) },
    { name: "Egg Tray (pack of 30)", category: "Equipment", price: 250, cost: 150, stock: 300, reorder: 100, image: img("egg,tray", 101) },
  ],
};

async function seedPoultry(ctx, byName) {
  const cohort = await Cohort.create({
    accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId,
    name: "Batch 7 — Broilers", species: "Broiler", startDate: daysAgo(28), initialCount: 150, currentCount: 150,
  });
  const feed = byName.get("Broiler Starter (25kg bag)")?.doc;
  const bird = byName.get("Live Broiler (bird)")?.doc;
  if (feed) {
    // Deliberately modest — the catalog seeds this bag already low (14, vs a
    // reorder level of 20) to show a real low-stock alert; feeding more than
    // that would either crash the seed or empty the shelf outright.
    for (const [daysBack, qty] of [[21, 3], [14, 4], [7, 3]]) {
      await applyMovement(ctx, { branchId: ctx.branchId, productId: feed._id, productName: feed.name, type: "OUT", qty: -qty, refType: "cohort_feed", refId: cohort._id, reason: `Fed to ${cohort.name}` });
      cohort.events.push({ type: "note", note: `${qty} bags fed`, at: daysAgo(daysBack) });
    }
  }
  cohort.currentCount -= 5;
  cohort.mortalityCount = 5;
  cohort.events.push({ type: "mortality", count: 5, note: "Heat stress, week 2", at: daysAgo(18) });
  if (bird) {
    await applyMovement(ctx, { branchId: ctx.branchId, productId: bird._id, productName: bird.name, type: "IN", qty: 100, refType: "cohort_harvest", refId: cohort._id, reason: `Harvested from ${cohort.name}` });
    cohort.currentCount -= 100;
    cohort.events.push({ type: "harvest", count: 100, productName: bird.name, note: "First harvest round", at: daysAgo(3) });
  }
  await cohort.save();
}

export const demo = {
  shop,
  // A broiler batch with feed given, a mortality event and a first harvest.
  async seed({ ctx, byName }) {
    await seedPoultry(ctx, byName);
  },
};
