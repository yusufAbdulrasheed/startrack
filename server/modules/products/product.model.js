import mongoose from "mongoose";

// v1 ships the stock-good archetype. Other archetypes (BOM, recipe, bookable…)
// arrive as new values of `archetype` + fields in `custom` — not new collections.
const productSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    barcode: { type: String, default: "", trim: true },
    // System-generated identifier, never typed by a user — see
    // products.routes.js's sku generation. Distinct from barcode, which is
    // whatever a physical label already carries (or nothing, for services).
    // No default: the {businessId, sku} index below is sparse, which only
    // excludes a document when the field is genuinely ABSENT — an explicit
    // "" is still a value and collides with every other product missing a
    // sku. A caller that skips sku entirely (see demoSeed.js's catalog
    // loop) must leave the field unset, not default it to empty.
    sku: { type: String, trim: true },
    category: { type: String, default: "General", trim: true },
    // "stock": normal shelf good. "made_to_order": built per order from
    // BOM components (blinds, curtains, tailoring) — carries no stock itself.
    archetype: { type: String, enum: ["stock", "made_to_order"], default: "stock" },
    price: { type: Number, required: true, min: 0 }, // stock: unit price · MTO: price per m²
    cost: { type: Number, default: 0, min: 0 }, // unit cost — NEVER sent to staff roles
    reorderLevel: { type: Number, default: 5, min: 0 },
    // The business's own recipe. For a made_to_order item: which stock
    // products it consumes and how the quantity is calculated from the
    // order's dimensions. For a stock item that is itself PRODUCED (water
    // factory, bakery, furniture, printing — the "production" capability):
    // the raw materials a production run consumes — see server/modules/production/.
    bom: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId, required: true },
        per: { type: String, enum: ["sqm", "width", "height", "unit"], required: true },
        factor: { type: Number, default: 1, min: 0 }, // wastage/multiplier
        // Production runs only: does this line scale with the run's leakage
        // count, or only with units actually produced? (e.g. a burst preform
        // still used a preform, but never reached the capping/labeling step.)
        includeLeakage: { type: Boolean, default: true },
      },
    ],
    // Production runs only: how many produced units make one credited stock
    // unit ("12 bottles = 1 pack", "20 sachets = 1 bag"). Meaningless — left
    // at the default — for anything without its own bom recipe.
    producedUnitsPerStockUnit: { type: Number, default: 1, min: 1 },
    expiry: { type: Date }, // optional, for expiry-tracked goods
    // Display unit for stock counts ("kg", "litre", "bag", "piece"…) — free
    // text, since markets sell in bags, cartons, derica, not just kg/litre.
    // Purely a label: Inventory.stock is always one flat number underneath.
    unit: { type: String, default: "unit" },
    // Optional conversion for a raw material bought in one unit and consumed
    // in another (a "bag" of rice bought, "kg" of rice cooked with). Stock-in
    // multiplies by unitsPerPurchase before it ever reaches applyMovement, so
    // Inventory.stock never mixes units.
    purchaseUnit: { type: String, default: "" },
    unitsPerPurchase: { type: Number, default: 1, min: 0.001 },
    // Per-product opt-in for the "serials" capability (electronics etc.) —
    // not every item on a serials-capable business needs individual tracking
    // (a phone does, a charging cable usually doesn't). See serial.model.js.
    tracksSerials: { type: Boolean, default: false },
    // Warranty period in months, applied to each Serial at the moment it's
    // sold (see serials capability). 0 = no warranty tracked — harmless for
    // every business type that doesn't set it.
    warrantyMonths: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "archived"], default: "active" },
    // Product photo, via Cloudinary (server/core/cloudinary.js) — optional;
    // POS and the catalog fall back to a category icon when absent.
    // imagePublicId is never sent to the client — it's only how a
    // replace/remove knows which Cloudinary asset to clean up.
    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },
    custom: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

productSchema.index({ businessId: 1, status: 1, name: 1 });
productSchema.index({ businessId: 1, barcode: 1 });
// A plain `sparse` index doesn't help here: businessId is required, and a
// sparse COMPOUND index only excludes a document when EVERY indexed field is
// missing, not just one — so with businessId always present, MongoDB indexed
// every sku-less product as {businessId, sku: null} and the second one
// always collided. A partial index — enforce uniqueness only among documents
// where sku genuinely exists — is what "unique when set" actually needs.
productSchema.index({ businessId: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: "string" } } });

export const Product = mongoose.model("Product", productSchema);
