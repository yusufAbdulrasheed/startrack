import mongoose from "mongoose";

// A brand/shop within an account. Carries the business type (vertical) and its
// settings. This is what the user thinks of as "my business".
const businessSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    name: { type: String, required: true, trim: true },
    typeKey: { type: String, default: "restaurant" }, // hotel | electronics | blinds | water | poultry | restaurant
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
      // The "loyalty" capability's two constants (water, for now). Missing
      // (legacy docs, or a business that never touched this screen) falls
      // back to these exact defaults wherever loyalty math is computed.
      loyalty: {
        sachetBagsPerToken: { type: Number, default: 2, min: 1 },
        tokensPerFreePack: { type: Number, default: 5, min: 1 },
      },
      // The "loyaltyCard" module's qualification rule + reward — separate
      // from `loyalty` above (water's free-pack mechanic). windowDays 0 =
      // lifetime totals, never reset.
      loyaltyRule: {
        mode: { type: String, enum: ["off", "visits", "spend"], default: "off" },
        threshold: { type: Number, default: 5, min: 1 },
        windowDays: { type: Number, default: 0, min: 0 },
        discountType: { type: String, enum: ["percent", "flat"], default: "percent" },
        discountValue: { type: Number, default: 5, min: 0 },
      },
      // Opt-in: off by default since it spends an AI request and adds
      // content to an email that might otherwise not exist at all — see
      // alerts.service.js's sendDigest, which only ever piggybacks this onto
      // an email already going out, never sends a second one just for it.
      ai: {
        digestEnabled: { type: Boolean, default: false },
      },
      // Gym memberships only (capability: "memberships") — how far ahead of
      // expiry to remind, and whether that reminder also SMS's the member
      // directly (opt-in/off by default — a direct member-facing text is a
      // bigger step than the owner-facing bell/digest every other alert uses).
      gym: {
        renewalReminderDays: { type: Number, default: 3, min: 0, max: 30 },
        smsReminders: { type: Boolean, default: false },
      },
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
