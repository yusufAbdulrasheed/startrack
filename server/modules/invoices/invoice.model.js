import mongoose from "mongoose";

/**
 * A bill sent to a customer. Issuing one is what makes it real: stock leaves,
 * the sale is recorded as owed, and the customer's balance goes up; payments then
 * bring that balance down (see invoices.service.js).
 *
 *   draft → issued → partial → paid          (or void, from any state but draft)
 *
 * "Overdue" is not a stored state: it is an issued or part-paid invoice whose due
 * date has passed, worked out when it's read so it can never be out of date.
 */
export const INVOICE_STATUSES = ["draft", "issued", "partial", "paid", "void"];

const invoiceSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // The store whose stock the invoice draws on.
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Given at issue time, not before: invoice numbers run 1, 2, 3 with no gaps,
    // which a deleted draft would otherwise leave.
    invoiceNo: { type: String },
    status: { type: String, enum: INVOICE_STATUSES, default: "draft" },

    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Copied onto the invoice: it must read the same years later, whatever happens to the customer record.
    customer: { name: { type: String, default: "" }, phone: { type: String, default: "" }, email: { type: String, default: "" }, address: { type: String, default: "" } },

    items: [
      {
        _id: false,
        // Absent for a custom line (a service, a delivery fee): no stock behind it.
        productId: { type: mongoose.Schema.Types.ObjectId, default: null },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: "", trim: true },
        qty: { type: Number, required: true, min: 0.001 },
        unitPrice: { type: Number, required: true, min: 0 },
        lineNet: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    vatRate: { type: Number, default: 0 }, // the % applied (0 = no VAT on this invoice)
    vat: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },

    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: "" },
    terms: { type: String, default: "" },

    payments: [{ method: { type: String, enum: ["cash", "pos", "transfer"], required: true }, amount: { type: Number, required: true, min: 0.01 }, at: { type: Date, default: Date.now }, by: { type: String, default: "" }, note: { type: String, default: "" } }],

    saleId: { type: mongoose.Schema.Types.ObjectId },
    // The customer's private link to view and print this invoice, no login needed.
    shareToken: { type: String },
    viewedAt: { type: Date },
    viewCount: { type: Number, default: 0 },
    sends: [{ _id: false, via: { type: String, enum: ["whatsapp", "email", "link"] }, kind: { type: String, enum: ["invoice", "reminder"], default: "invoice" }, to: { type: String, default: "" }, at: { type: Date, default: Date.now }, by: { type: String, default: "" } }],

    voidInfo: { by: { type: String }, reason: { type: String }, at: { type: Date } },
    createdBy: { type: String, default: "" },
  },
  { timestamps: true }
);

invoiceSchema.index({ businessId: 1, invoiceNo: 1 }, { unique: true, partialFilterExpression: { invoiceNo: { $type: "string" } } });
invoiceSchema.index({ businessId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
invoiceSchema.index({ shareToken: 1 }, { unique: true, partialFilterExpression: { shareToken: { $type: "string" } } });

export const Invoice = mongoose.model("Invoice", invoiceSchema);
