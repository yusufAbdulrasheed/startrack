import mongoose from "mongoose";

// Human-friendly sequential numbers (receipts etc), one counter per scope.
const counterSchema = new mongoose.Schema({
  scopeKey: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

export async function nextSeq(scopeKey) {
  const doc = await Counter.findOneAndUpdate(
    { scopeKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}
