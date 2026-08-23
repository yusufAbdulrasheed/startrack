import mongoose from "mongoose";

// Human-friendly sequential numbers (receipts etc), one counter per scope.
const counterSchema = new mongoose.Schema({
  scopeKey: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

// Pass the caller's session so an aborted transaction gives the number back
// instead of leaving a gap in the receipt sequence.
export async function nextSeq(scopeKey, session = null) {
  const doc = await Counter.findOneAndUpdate(
    { scopeKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return doc.seq;
}
