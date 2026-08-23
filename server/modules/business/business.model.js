import mongoose from "mongoose";

// A brand/shop within an account. Carries the business type (vertical) and its
// settings. This is what the user thinks of as "my business".
const businessSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    name: { type: String, required: true, trim: true },
    typeKey: { type: String, default: "retail" }, // retail | pharmacy | restaurant | ...
    // What the business is REGISTERED as, versus what the sign says. Receipts
    // and invoices need the legal name; customers only ever see the trading one.
    tradingName: { type: String, default: "", trim: true },
    taxId: { type: String, default: "", trim: true },
    employees: { type: Number, default: 0, min: 0 },
    // Short code staff type once on a till device before PIN login.
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    settings: {
      currency: { type: String, default: "₦" },
      vatEnabled: { type: Boolean, default: false },
      vatRate: { type: Number, default: 7.5 },
      receiptFooter: { type: String, default: "Thank you for your patronage!" },
      // Kept for documents written before alerts went multi-recipient. Read
      // through alertRecipients() below, never directly.
      alertEmail: { type: String, default: "" },
      // Everyone who should hear about low stock, expiry and pending returns.
      // A shop usually wants the owner AND whoever actually does the ordering.
      alertEmails: { type: [String], default: undefined },
      alerts: {
        lowStock: { type: Boolean, default: true },
        outOfStock: { type: Boolean, default: true },
        expiry: { type: Boolean, default: true },
        pendingReturns: { type: Boolean, default: true },
        // Days before expiry to speak up. Each threshold fires once per
        // product per expiry date, so a tightening set escalates rather
        // than repeats: a month's notice, a fortnight's, then a week's.
        expiryDays: { type: [Number], default: [30, 14, 7] },
        // Whether anything is emailed at all — the in-app bell is always on.
        email: { type: Boolean, default: true },
      },
      // Which optional modules this business uses (seeded from its type,
      // owner-editable in Settings). Missing (legacy docs) = everything on.
      modules: { type: [String], default: undefined },
    },
  },
  { timestamps: true }
);

/**
 * Who gets alert email for this business. Prefers the list, falls back to the
 * single address older documents carry, and de-duplicates — so a business
 * saved before the list existed keeps working without a migration.
 */
export function alertRecipients(business) {
  const list = business?.settings?.alertEmails?.length
    ? business.settings.alertEmails
    : [business?.settings?.alertEmail].filter(Boolean);
  return [...new Set(list.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
}

// Unambiguous alphabet (no O/0/I/1 confusion) for codes read out loud to staff.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateBusinessCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

businessSchema.pre("validate", function (next) {
  if (!this.code) this.code = generateBusinessCode();
  next();
});

export const Business = mongoose.model("Business", businessSchema);
