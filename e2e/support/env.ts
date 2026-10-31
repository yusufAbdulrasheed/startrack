/**
 * Everything the end-to-end suite agrees on in one place.
 *
 * SAFETY: this suite creates, changes and deletes data. It must never touch the
 * real database (the .env MONGODB_URI is an Atlas cluster with real customers).
 * The API under test is started by playwright.config.ts with MONGODB_URI forced
 * to the local throwaway database below, and every entry point re-checks it with
 * assertLocalMongo() — so even a misconfigured run refuses instead of writing.
 */
export const API_PORT = 4100;
export const WEB_PORT = 5190;

// The local dev MongoDB (`npm run dev:db`, port 27818). The database name is a
// throwaway one that only this suite uses; teardown drops it.
export const DB_NAME = "startrack_pw_e2e";
export const MONGO_URI = process.env.E2E_MONGO_URI || `mongodb://127.0.0.1:27818/${DB_NAME}?replicaSet=rs0`;

export function assertLocalMongo(uri: string = MONGO_URI) {
  const host = uri.replace(/^mongodb(\+srv)?:\/\//, "").replace(/^[^@]*@/, "").split(/[/?]/)[0];
  const local = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  const name = (uri.split("?")[0].split("/").pop() || "").trim();
  if (!local) throw new Error(`E2E safety stop: "${host}" is not a local MongoDB. Refusing to run against it.`);
  if (!name.startsWith("startrack_pw_")) throw new Error(`E2E safety stop: database "${name}" is not a throwaway test database (name must start with startrack_pw_).`);
}

export const SLUG = "fresh-mart";
export const OWNER = { name: "Ada Okoye", email: "owner@freshmart.test", phone: "08030000009", password: "OwnerPass123" };
export const CUSTOMER = { name: "Chidi Okafor", phone: "0803 555 1234", email: "chidi@example.test", password: "ShopPass123" };
export const ADDRESS = "12 Admiralty Way, Lekki Phase 1, Lagos";

// name, category, price, cost, stock
export const PRODUCTS: [string, string, number, number, number][] = [
  ["Premium Rice 5kg", "Grains", 5200, 3900, 40],
  ["Vegetable Oil 1L", "Cooking", 2300, 1700, 3],
  ["Spaghetti 500g", "Grains", 650, 450, 120],
  ["Tomato Paste 400g", "Cooking", 900, 600, 60],
  ["Fresh Eggs (crate)", "Fresh", 3800, 3000, 15],
  ["Whole Milk 1L", "Dairy", 1450, 1100, 24],
  ["Butter 250g", "Dairy", 1800, 1300, 0],
  ["Plantain (bunch)", "Fresh", 1200, 800, 30],
  ["Bottled Water 75cl x12", "Drinks", 1900, 1400, 50],
  ["Orange Juice 1L", "Drinks", 1600, 1100, 4],
];
