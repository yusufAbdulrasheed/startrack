import mongoose from "mongoose";

// v1 ships the stock-good archetype. Other archetypes (BOM, recipe, bookable…)
// arrive as new values of `archetype` + fields in `custom` — not new collections.
const productSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    barcode: { type: String, default: "", trim: true },
    category: { type: String, default: "General", trim: true },
    // "stock": normal shelf good. "made_to_order": built per order from
    // BOM components (blinds, curtains, tailoring) — carries no stock itself.
    archetype: { type: String, enum: ["stock", "made_to_order"], default: "stock" },
    price: { type: Number, required: true, min: 0 }, // stock: unit price · MTO: price per m²
    cost: { type: Number, default: 0, min: 0 }, // unit cost — NEVER sent to staff roles
    reorderLevel: { type: Number, default: 5, min: 0 },
    // The business's own recipe: which stock products a made-to-order item
    // consumes and how the quantity is calculated from the order's dimensions.
    bom: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        per: { type: String, enum: ["sqm", "width", "height", "unit"], required: true },
        factor: { type: Number, default: 1, min: 0 }, // wastage/multiplier
      },
    ],
    expiry: { type: Date }, // optional, for expiry-tracked goods
    status: { type: String, enum: ["active", "archived"], default: "active" },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

productSchema.index({ businessId: 1, status: 1, name: 1 });
productSchema.index({ businessId: 1, barcode: 1 });

export const Product = mongoose.model("Product", productSchema);
