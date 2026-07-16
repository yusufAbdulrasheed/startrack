import mongoose from "mongoose";

// A brand/shop within an account. Carries the business type (vertical) and its
// settings. This is what the user thinks of as "my business".
const businessSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    name: { type: String, required: true, trim: true },
    typeKey: { type: String, default: "retail" }, // retail | pharmacy | restaurant | ...
    // Short code staff type once on a till device before PIN login.
    code: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    settings: {
      currency: { type: String, default: "₦" },
      vatEnabled: { type: Boolean, default: false },
      vatRate: { type: Number, default: 7.5 },
      receiptFooter: { type: String, default: "Thank you for your patronage!" },
      alertEmail: { type: String, default: "" },
      // Which optional modules this business uses (seeded from its type,
      // owner-editable in Settings). Missing (legacy docs) = everything on.
      modules: { type: [String], default: undefined },
    },
  },
  { timestamps: true }
);

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
