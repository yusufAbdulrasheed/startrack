import mongoose from "mongoose";

/**
 * A stay: one guest, one room, a date range — and the folio that grows
 * underneath it.
 *
 * The folio is the other thing a till cannot express. A guest arrives on
 * Monday, the kitchen sends breakfast on Tuesday, the bar sends drinks on
 * Tuesday night, laundry on Wednesday, and the whole lot settles once on
 * Thursday. Every one of those is a charge posted to an OPEN bill, not a
 * sale — the money doesn't move until check-out.
 */

export const STAY_STATUS = ["booked", "checked_in", "checked_out", "cancelled", "no_show"];

// Dates are stored as YYYY-MM-DD, not timestamps. A hotel night is a calendar
// concept: "the 19th" means the same night regardless of what time the guest
// walked in, and timezone drift on a Date object would silently move it.
const dayString = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ };

const staySchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    folioNo: { type: String, required: true },

    roomId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomNumber: { type: String, default: "" },
    roomTypeName: { type: String, default: "" },

    guestName: { type: String, required: true, trim: true },
    guestPhone: { type: String, default: "" },
    customerId: { type: mongoose.Schema.Types.ObjectId },
    guests: { type: Number, default: 1, min: 1 },

    // [checkIn, checkOut) — the guest occupies the nights from checkIn up to
    // but NOT including checkOut, which is why a same-day turnaround is legal.
    checkIn: dayString,
    checkOut: dayString,
    nights: { type: Number, required: true, min: 1 },
    nightlyRate: { type: Number, required: true, min: 0 },

    status: { type: String, enum: STAY_STATUS, default: "booked", index: true },
    checkedInAt: { type: Date },
    checkedOutAt: { type: Date },

    /**
     * The folio. Room nights are posted on check-in; everything else arrives
     * from whichever outlet served it.
     */
    charges: [
      {
        _id: false,
        at: { type: Date, default: Date.now },
        source: { type: String, enum: ["room", "kitchen", "bar", "laundry", "extras"], default: "extras" },
        productId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        qty: { type: Number, default: 1, min: 0 },
        unitPrice: { type: Number, required: true },
        lineCost: { type: Number, default: 0 },
        lineNet: { type: Number, required: true },
        byName: { type: String, default: "" },
        // Set when the charge took something off a shelf (a drink, a meal).
        stockMoved: { type: Boolean, default: false },
      },
    ],

    payments: [
      {
        _id: false,
        method: { type: String, enum: ["cash", "pos", "transfer"], required: true },
        amount: { type: Number, required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, default: "" },
      },
    ],

    discount: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    saleId: { type: mongoose.Schema.Types.ObjectId },

    notes: { type: String, default: "" },
    staffName: { type: String, default: "" },
  },
  { timestamps: true }
);

// The overlap query that answers "is this room free?" runs constantly.
staySchema.index({ businessId: 1, roomId: 1, status: 1, checkIn: 1, checkOut: 1 });
staySchema.index({ businessId: 1, branchId: 1, status: 1 });
staySchema.index({ businessId: 1, folioNo: 1 });

export const Stay = mongoose.model("Stay", staySchema);
