/**
 * Blinds — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import { seedImage as img, seedJobTicket } from "#platform/index.js";

const shop = {
  label: "Window Blinds", group: "Workshop & Trade", depth: "full",
  blurb: "Priced per square metre, cut from rail and fabric you hold in stock.",
  business: "ClearView Blinds",
  branch: { name: "Showroom", address: "31 Awolowo Way, Ikeja" },
  highlight: "A 2m × 1.5m blind consumes rail, fabric and brackets",
  catalog: [
    { name: "Blackout Fabric (metre)", category: "Fabrics", price: 4800, cost: 3200, stock: 90, reorder: 30, image: img("curtain,fabric", 1) },
    { name: "Sheer Day Fabric (metre)", category: "Fabrics", price: 3600, cost: 2400, stock: 65, reorder: 30, image: img("sheer,curtain", 2) },
    { name: "Aluminium Rail (metre)", category: "Tracks & Rails", price: 2500, cost: 1600, stock: 48, reorder: 20, image: img("aluminium,rail", 3) },
    { name: "Bottom Bar (metre)", category: "Tracks & Rails", price: 1400, cost: 850, stock: 40, reorder: 20, image: img("metal,bar", 4) },
    { name: "Mounting Bracket", category: "Fittings", price: 700, cost: 380, stock: 160, reorder: 60, image: img("bracket,metal", 5) },
    { name: "Chain & Control Set", category: "Fittings", price: 1800, cost: 1050, stock: 52, reorder: 25, image: img("chain,metal", 6) },
    { name: "Vertical Blind Slat", category: "Blinds", price: 950, cost: 560, stock: 220, reorder: 80, image: img("blinds,window", 7) },
    { name: "Installation (per window)", category: "Installation", price: 5000, cost: 1500, stock: 999, reorder: 0, image: img("window,installation", 8) },
    { name: "Site Measurement Visit", category: "Installation", price: 3000, cost: 800, stock: 999, reorder: 0, image: img("tape,measure", 9) },
    { name: "Linen Textured Fabric (metre)", category: "Fabrics", price: 5200, cost: 3400, stock: 75, reorder: 30, image: img("linen,fabric", 10) },
    { name: "Wood Venetian Slat (metre)", category: "Blinds", price: 1600, cost: 950, stock: 140, reorder: 60, image: img("wood,blinds", 11) },
    { name: "PVC Venetian Slat (metre)", category: "Blinds", price: 1100, cost: 650, stock: 160, reorder: 60, image: img("venetian,blinds", 12) },
    { name: "Roman Blind Fabric (metre)", category: "Fabrics", price: 5600, cost: 3800, stock: 50, reorder: 20, image: img("roman,blinds", 13) },
    { name: "Curtain Track (metre)", category: "Tracks & Rails", price: 2100, cost: 1300, stock: 60, reorder: 25, image: img("curtain,track", 14) },
    { name: "Wand Control", category: "Fittings", price: 1200, cost: 700, stock: 80, reorder: 30, image: img("blinds,control", 15) },
    { name: "Cassette Head Rail (metre)", category: "Tracks & Rails", price: 3200, cost: 2100, stock: 35, reorder: 15, image: img("curtain,rail", 16) },
    { name: "Tieback Hook", category: "Fittings", price: 450, cost: 220, stock: 200, reorder: 80, image: img("curtain,hook", 17) },
    { name: "Weight Bar (metre)", category: "Fittings", price: 900, cost: 500, stock: 70, reorder: 30, image: img("metal,bar", 18) },
    { name: "Curtain Hooks (pack of 50)", category: "Fittings", price: 1500, cost: 900, stock: 40, reorder: 15, image: img("curtain,hooks", 19) },
    { name: "Repair & Adjustment (per window)", category: "Installation", price: 3500, cost: 1000, stock: 999, reorder: 0, image: img("tools,repair", 20) },
  ],
  madeToOrder: {
    name: "Roller Blind (made to size)", category: "Blinds", price: 6500,
    image: img("roller,blinds", 21),
    bom: [
      { component: "Blackout Fabric (metre)", per: "sqm", factor: 1.1 },
      { component: "Aluminium Rail (metre)", per: "width", factor: 1 },
      { component: "Bottom Bar (metre)", per: "width", factor: 1 },
      { component: "Mounting Bracket", per: "unit", factor: 2 },
      { component: "Chain & Control Set", per: "unit", factor: 1 },
    ],
  },
};


export const demo = {
  shop,
  // Work taken in: three windows, deposit paid, fabric reserved from stock.
  async seed({ ctx, business, byName }) {
    const fabric = byName.get("Blackout Fabric (metre)")?.doc;
    await seedJobTicket(ctx, business, byName, {
      title: "3 windows — living room blinds", reference: "Aduke Residence, Lekki",
      lines: [
        ...(fabric ? [{ productId: String(fabric._id), qty: 8 }] : []),
        { name: "Installation labour", price: 15000, qty: 1 },
      ],
      deposit: 20000, stage: "in_progress",
    });
  },
};
