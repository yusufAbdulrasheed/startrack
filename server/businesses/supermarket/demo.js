/**
 * Supermarket — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import { seedImage as img, inDays } from "#platform/index.js";

const shop = {
  label: "Supermarket / Mini-Mart", group: "Retail", depth: "full",
  blurb: "Everyday groceries, priced and counted right.",
  business: "Fresh Mart Supermarket",
  branch: { name: "Main Store", address: "15 Allen Avenue, Ikeja" },
  highlight: "A full FMCG catalog with reorder levels already set",
  catalog: [
    { name: "Rice (50kg bag)", category: "Groceries", price: 78000, cost: 71000, stock: 6, reorder: 3, image: img("rice,bag", 163) },
    { name: "Semovita (2kg)", category: "Groceries", price: 2200, cost: 1850, stock: 40, reorder: 15, image: img("flour,bag", 164) },
    { name: "Vegetable Oil (5L)", category: "Groceries", price: 13500, cost: 11800, stock: 25, reorder: 10, image: img("cooking,oil", 165) },
    { name: "Spaghetti (500g)", category: "Groceries", price: 900, cost: 650, stock: 80, reorder: 30, image: img("pasta,spaghetti", 166) },
    { name: "Sugar (1kg)", category: "Groceries", price: 1500, cost: 1200, stock: 50, reorder: 20, image: img("sugar,bag", 167) },
    { name: "Tomato Paste (tin)", category: "Groceries", price: 450, cost: 320, stock: 100, reorder: 40, image: img("tomato,can", 168) },
    { name: "Bottled Water 75cl", category: "Beverages", price: 250, cost: 150, stock: 200, reorder: 80, image: img("bottled,water", 169) },
    { name: "Coca-Cola 35cl", category: "Beverages", price: 400, cost: 280, stock: 150, reorder: 60, image: img("cola,soda", 170) },
    { name: "Malt Drink 33cl", category: "Beverages", price: 500, cost: 380, stock: 100, reorder: 40, image: img("malt,drink", 171) },
    { name: "Orange Juice 1L", category: "Beverages", price: 1800, cost: 1400, stock: 40, reorder: 15, image: img("orange,juice", 172) },
    { name: "Toilet Roll (pack of 4)", category: "Household", price: 1200, cost: 900, stock: 60, reorder: 25, image: img("toilet,paper", 173) },
    { name: "Detergent Powder (1kg)", category: "Household", price: 1800, cost: 1400, stock: 45, reorder: 20, image: img("detergent,laundry", 174) },
    { name: "Dish Soap (500ml)", category: "Household", price: 900, cost: 650, stock: 50, reorder: 20, image: img("dish,soap", 175) },
    { name: "Insecticide Spray", category: "Household", price: 2200, cost: 1700, stock: 30, reorder: 12, image: img("spray,bottle", 176) },
    { name: "Toothpaste", category: "Personal Care", price: 950, cost: 700, stock: 70, reorder: 30, image: img("toothpaste,tube", 177) },
    { name: "Bathing Soap", category: "Personal Care", price: 500, cost: 350, stock: 90, reorder: 35, image: img("soap,bar", 178) },
    { name: "Sanitary Pad (pack)", category: "Personal Care", price: 1100, cost: 800, stock: 40, reorder: 15, image: img("personal,care", 179) },
    { name: "Potato Chips", category: "Snacks", price: 700, cost: 450, stock: 60, reorder: 25, image: img("chips,snack", 180) },
    { name: "Biscuit Pack", category: "Snacks", price: 400, cost: 280, stock: 100, reorder: 40, image: img("biscuits,snack", 181) },
    { name: "Frozen Chicken (kg)", category: "Frozen", price: 3200, cost: 2700, stock: 30, reorder: 10, expiry: inDays(60), image: img("frozen,chicken", 182) },
    { name: "Ice Cream Tub", category: "Frozen", price: 3500, cost: 2600, stock: 20, reorder: 8, image: img("icecream,tub", 183) },
  ],
};


export const demo = {
  shop,
};
