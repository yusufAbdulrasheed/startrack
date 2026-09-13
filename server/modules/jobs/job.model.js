import mongoose from "mongoose";

/**
 * A job ticket: work taken in, worked on over days, collected and paid for.
 *
 * This is the primitive nine trades need and a till cannot express. A suit
 * being altered, a car being repaired, a laptop being fixed, a print run and
 * a load of laundry are the same shape: something arrives, it moves through
 * stages, parts and labour accumulate against it, and one day someone comes
 * back for it.
 *
 * The difference from a sale is TIME. A sale is instantaneous; a job is open
 * for days, which means it needs a stage, a promised date, and a balance that
 * isn't settled yet.
 */

// Deliberately generic. A mechanic's "in progress" and a laundry's "washing"
// are the same stage wearing different words — the trade supplies the words
// (see stageLabels in the shared config), the workflow stays one thing.
export const JOB_STAGES = ["received", "in_progress", "ready", "collected", "cancelled"];

const jobSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    jobNo: { type: String, required: true }, // human ticket number, per-branch sequence

    customerId: { type: mongoose.Schema.Types.ObjectId },
    customerName: { type: String, default: "" },
    customerPhone: { type: String, default: "" },

    title: { type: String, required: true, trim: true }, // "Brake service", "3 shirts + 2 trousers"
    // The thing itself: a plate number, a garment tag, an IMEI. What the
    // counter staff actually calls out when someone arrives to collect.
    reference: { type: String, default: "", trim: true },
    // Ties a repair ticket to a specific tracked unit (server/modules/products/
    // serial.model.js) — this is how a serial's "repair history" is read: query
    // Job by serialNo rather than duplicating a second ticket system.
    serialNo: { type: String, default: "", trim: true, index: true },
    notes: { type: String, default: "" },

    stage: { type: String, enum: JOB_STAGES, default: "received", index: true },
    stageHistory: [
      {
        _id: false,
        stage: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId },
        byName: { type: String, default: "" },
        note: { type: String, default: "" },
      },
    ],

    // Parts come out of stock; labour and services never do.
    lines: [
      {
        _id: false,
        productId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        kind: { type: String, enum: ["part", "labour"], default: "part" },
        qty: { type: Number, required: true, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        lineCost: { type: Number, default: 0 },
        lineNet: { type: Number, required: true },
      },
    ],

    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    // Taken at drop-off. Held against the job, not counted as revenue until
    // the work is delivered — see jobs.service.js.
    deposit: { type: Number, default: 0 },
    depositMethod: { type: String, enum: ["cash", "pos", "transfer"], default: "cash" },

    promisedAt: { type: Date },
    receivedAt: { type: Date, default: Date.now },
    readyAt: { type: Date },
    collectedAt: { type: Date },

    // Set once the job is collected and turns into a sale.
    saleId: { type: mongoose.Schema.Types.ObjectId },
    // True once parts have been taken out of stock, so cancelling knows
    // whether there is anything to put back.
    partsConsumed: { type: Boolean, default: false },

    staffId: { type: mongoose.Schema.Types.ObjectId },
    staffName: { type: String, default: "" },
  },
  { timestamps: true }
);

jobSchema.index({ businessId: 1, branchId: 1, stage: 1, promisedAt: 1 });
jobSchema.index({ businessId: 1, jobNo: 1 });
jobSchema.index({ businessId: 1, customerId: 1, createdAt: -1 });
jobSchema.index({ businessId: 1, reference: 1 });

export const Job = mongoose.model("Job", jobSchema);
