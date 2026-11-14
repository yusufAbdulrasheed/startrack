/**
 * Electronics — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import { seedImage as img, seedJobTicket, daysAgo, Inventory } from "#platform/index.js";
import { Serial } from "./serial.model.js";

const shop = {
  label: "Electronics", group: "Workshop & Trade", depth: "full",
  blurb: "High-value stock where a single unit matters.",
  business: "Bright Tech Store",
  branch: { name: "Main Shop", address: "3 Computer Village, Ikeja" },
  highlight: "Margins visible on every line — staff never see cost",
  catalog: [
    { name: "iPhone 13 128GB", category: "Phones", price: 620000, cost: 545000, stock: 4, reorder: 3, image: img("iphone,smartphone", 22) },
    { name: "Samsung A15", category: "Phones", price: 185000, cost: 158000, stock: 11, reorder: 5, image: img("samsung,phone", 23) },
    { name: "Tecno Spark 20", category: "Phones", price: 128000, cost: 108000, stock: 2, reorder: 6, image: img("smartphone,mobile", 24) },
    { name: "HP Pavilion i5", category: "Computers", price: 780000, cost: 690000, stock: 3, reorder: 2, image: img("laptop,computer", 25) },
    { name: "Wireless Mouse", category: "Accessories", price: 6500, cost: 3800, stock: 40, reorder: 15, image: img("mouse,computer", 26) },
    { name: "65W USB-C Charger", category: "Accessories", price: 12000, cost: 7200, stock: 26, reorder: 12, image: img("charger,usb", 27) },
    { name: "Power Bank 20000mAh", category: "Accessories", price: 22000, cost: 14500, stock: 8, reorder: 10, image: img("powerbank,battery", 28) },
    { name: "Bluetooth Speaker", category: "Audio & TV", price: 35000, cost: 24000, stock: 6, reorder: 4, image: img("speaker,bluetooth", 29) },
    { name: "43in Smart TV", category: "Audio & TV", price: 295000, cost: 248000, stock: 2, reorder: 2, image: img("television,tv", 30) },
    { name: "Screen Replacement", category: "Repairs", price: 45000, cost: 28000, stock: 999, reorder: 0, image: img("phone,repair", 31) },
    { name: "iPhone 14 128GB", category: "Phones", price: 780000, cost: 690000, stock: 3, reorder: 2, image: img("iphone,smartphone", 32) },
    { name: "Infinix Note 30", category: "Phones", price: 210000, cost: 178000, stock: 9, reorder: 5, image: img("smartphone,mobile", 33) },
    { name: "Dell Inspiron i5", category: "Computers", price: 650000, cost: 570000, stock: 2, reorder: 2, image: img("laptop,dell", 34) },
    { name: "Lenovo ThinkPad", category: "Computers", price: 720000, cost: 635000, stock: 2, reorder: 2, image: img("laptop,computer", 35) },
    { name: "Wireless Keyboard", category: "Accessories", price: 8500, cost: 5200, stock: 25, reorder: 10, image: img("keyboard,computer", 36) },
    { name: "HDMI Cable 2m", category: "Accessories", price: 3500, cost: 2000, stock: 60, reorder: 20, image: img("hdmi,cable", 37) },
    { name: "Screen Protector", category: "Accessories", price: 2000, cost: 900, stock: 100, reorder: 40, image: img("phone,screen", 38) },
    { name: "Earpiece (wired)", category: "Accessories", price: 3000, cost: 1600, stock: 50, reorder: 20, image: img("earphones,headphones", 39) },
    { name: "32in Smart TV", category: "Audio & TV", price: 165000, cost: 138000, stock: 4, reorder: 3, image: img("television,tv", 40) },
    { name: "Battery Replacement", category: "Repairs", price: 18000, cost: 9000, stock: 999, reorder: 0, image: img("battery,phone", 41) },
  ],
};

async function seedElectronicsSerials(ctx, byName) {
  const phone = byName.get("iPhone 13 128GB")?.doc;
  if (!phone) return;
  phone.tracksSerials = true;
  phone.warrantyMonths = 12;
  await phone.save();
  const stock = await Inventory.findOne({ branchId: ctx.branchId, productId: phone._id });
  const count = stock?.stock || 4;
  for (let i = 1; i <= count; i++) {
    await Serial.create({
      accountId: ctx.accountId, businessId: ctx.businessId, branchId: ctx.branchId, productId: phone._id, productName: phone.name,
      serialNo: `IMEI-${String(35000000 + i).padStart(9, "0")}`, status: "in_stock", at: daysAgo(15),
    });
  }
}

export const demo = {
  shop,
  // Units tracked by serial number, then a repair taken in as a job ticket.
  async seed({ ctx, business, byName }) {
    await seedElectronicsSerials(ctx, byName);
    await seedJobTicket(ctx, business, byName, {
      title: "Cracked screen — iPhone 13", reference: "IMEI-035000003",
      lines: [{ name: "Screen replacement labour", price: 20000, qty: 1 }],
      deposit: 10000, stage: "ready",
    });
  },
};
