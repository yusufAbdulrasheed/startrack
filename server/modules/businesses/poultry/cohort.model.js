import mongoose from "mongoose";

/**
 * A cohort is a living batch — a flock brought in together, fed daily,
 * shrinking to mortality, and eventually harvested (birds for meat, or
 * ongoing produce like eggs). It is NOT Product stock: a bird only becomes
 * sellable stock the moment it (or what it produces) is harvested — see
 * cohorts.routes.js's /harvest, which credits a real Product's stock via
 * the ordinary ledger (applyMovement), exactly like a Production Run
 * credits a finished good from raw materials.
 *
 * Feed and harvest both move real Product stock, so they go through
 * applyMovement and are traceable in StockMovement by refType
 * ("cohort_feed" / "cohort_harvest") + refId (this cohort's _id) — no
 * parallel ledger. Mortality touches no Product stock at all (a dead bird
 * was never inventory), so it's tracked here as a simple embedded event
 * instead of forcing it through a ledger built for stock.
 */
const cohortSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true }, // "Batch 12 — Broilers"
    species: { type: String, default: "", trim: true }, // free text: Broiler, Layer, Turkey…
    startDate: { type: Date, default: Date.now },
    initialCount: { type: Number, required: true, min: 1 },
    currentCount: { type: Number, required: true, min: 0 },
    mortalityCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["active", "closed"], default: "active" },
    events: [
      {
        _id: false,
        type: { type: String, enum: ["mortality", "harvest", "note"], required: true },
        count: { type: Number },
        productName: { type: String, default: "" },
        note: { type: String, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
    notes: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

cohortSchema.index({ businessId: 1, branchId: 1, status: 1, at: -1 });

export const Cohort = mongoose.model("Cohort", cohortSchema);
