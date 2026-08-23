// Frontend mirror of server/src/lib/businessTypes.js — terminology per type.
// Keys must match what Register sends and the server templates define.
export type TypeMeta = { label: string; products: string; pos: string };

export const TYPE_META: Record<string, TypeMeta> = {
  retail: { label: "Supermarket / Retail", products: "Products", pos: "Point of Sale" },
  pharmacy: { label: "Pharmacy", products: "Medicines", pos: "Dispensary" },
  restaurant: { label: "Restaurant / Eatery", products: "Menu Items", pos: "Order Point" },
  fashion: { label: "Fashion / Boutique", products: "Items", pos: "Point of Sale" },
  tailoring: { label: "Tailoring / Fashion Design", products: "Items & Fabrics", pos: "Point of Sale" },
  electronics: { label: "Electronics", products: "Products", pos: "Point of Sale" },
  hotel: { label: "Hotel / Guest House", products: "Services & Items", pos: "Front Desk" },
  salon: { label: "Salon / Beauty", products: "Services & Products", pos: "Point of Sale" },
  bakery: { label: "Bakery", products: "Products", pos: "Point of Sale" },
  bar: { label: "Bar / Lounge", products: "Drinks & Items", pos: "Point of Sale" },
  services: { label: "General Services", products: "Services", pos: "Point of Sale" },
  other: { label: "General Business", products: "Products", pos: "Point of Sale" },
};

export function typeMeta(typeKey?: string): TypeMeta {
  return TYPE_META[typeKey || "other"] || TYPE_META.other;
}
