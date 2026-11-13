import mongoose from "mongoose";

/**
 * Team chat inside one business: a shared "team" room plus one-to-one rooms
 * between any two people who work there (owner, admin, manager, sales rep).
 *
 * A room is just a string on each message: "team", or "dm:<idA>:<idB>" with the
 * two user ids sorted, so both sides compute the same room without a rooms
 * collection to keep in step. Messages are scoped to a business, so people who
 * work in two businesses have two separate chats.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
    room: { type: String, required: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, default: "staff" },
    text: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
chatMessageSchema.index({ businessId: 1, room: 1, createdAt: -1 });

/** When each person last opened each room — what "unread" is counted from. */
const chatReadSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  room: { type: String, required: true },
  lastReadAt: { type: Date, default: () => new Date(0) },
});
chatReadSchema.index({ businessId: 1, userId: 1, room: 1 }, { unique: true });

export const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);
export const ChatRead = mongoose.model("ChatRead", chatReadSchema);
