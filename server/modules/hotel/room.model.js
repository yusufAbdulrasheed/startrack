import mongoose from "mongoose";

/**
 * A room is NOT stock.
 *
 * Selling "Standard Room ×1" out of a stock count of 12 is the mistake this
 * module exists to fix: a room is never consumed. It is occupied for a date
 * range and then free again, so availability is a calendar question — "is
 * anything overlapping these nights?" — not a quantity.
 *
 * That single difference is why a hotel cannot run on a till.
 */

const roomTypeSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, trim: true }, // Standard, Deluxe, Suite
    rate: { type: Number, required: true, min: 0 },     // per night
    capacity: { type: Number, default: 2, min: 1 },
    amenities: { type: [String], default: [] },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);
roomTypeSchema.index({ businessId: 1, name: 1 }, { unique: true });

export const RoomType = mongoose.model("RoomType", roomTypeSchema);

// What housekeeping thinks of the room, which is separate from whether a
// guest is in it. A room can be free but dirty — bookable, not yet sellable.
export const HOUSEKEEPING = ["clean", "dirty", "out_of_service"];

const roomSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomTypeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    number: { type: String, required: true, trim: true }, // "101"
    floor: { type: String, default: "" },
    housekeeping: { type: String, enum: HOUSEKEEPING, default: "clean" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);
roomSchema.index({ businessId: 1, branchId: 1, number: 1 }, { unique: true });

export const Room = mongoose.model("Room", roomSchema);
