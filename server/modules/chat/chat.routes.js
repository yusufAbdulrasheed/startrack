import { Router } from "express";
import { z } from "zod";
import { Membership } from "#modules/auth/membership.model.js";
import { User } from "#modules/auth/user.model.js";
import { rateLimit } from "#core/rateLimit.js";
import { ChatMessage, ChatRead } from "#modules/chat/chat.model.js";

/**
 * Team chat for a business. Every role that belongs to the business can use it
 * (that is the point: owner, manager and sales rep talk to each other), so there
 * is deliberately no requirePerm here — the tenant context already proves the
 * caller works in this business.
 *
 * It is request/response, polled by the app every few seconds, not a held-open
 * connection: the API also runs as serverless functions, which can't keep one.
 */
export const chatRouter = Router();

const RANK = { owner: 0, admin: 1, manager: 2, staff: 3 };
const dmRoom = (a, b) => `dm:${[String(a), String(b)].sort().join(":")}`;
const PAGE = 60;

/** Everyone who works in this business, once each (an owner holds an account-wide membership). */
async function teamOf(ctx) {
  const ms = await Membership.find({
    accountId: ctx.accountId,
    status: "active",
    $or: [{ businessId: ctx.businessId }, { businessId: null }],
  }).select("userId role");
  const best = new Map();
  for (const m of ms) {
    const id = String(m.userId);
    if (!best.has(id) || (RANK[m.role] ?? 9) < (RANK[best.get(id)] ?? 9)) best.set(id, m.role);
  }
  const users = await User.find({ _id: { $in: [...best.keys()] }, status: "active" }).select("name");
  return users
    .map((u) => ({ id: String(u._id), name: u.name, role: best.get(String(u._id)) }))
    .sort((a, b) => (RANK[a.role] ?? 9) - (RANK[b.role] ?? 9) || a.name.localeCompare(b.name));
}

/** Is `room` one this person may use? "team", or a one-to-one with a colleague. */
function roomAllowed(room, meId, team) {
  if (room === "team") return true;
  const m = /^dm:([a-f\d]{24}):([a-f\d]{24})$/i.exec(room);
  if (!m) return false;
  const [a, b] = [m[1], m[2]];
  if (![a, b].includes(String(meId))) return false;
  const other = a === String(meId) ? b : a;
  return room === dmRoom(a, b) && team.some((t) => t.id === other);
}

/** Unread count per room: messages from others, newer than when this person last opened it. */
async function unreadByRoom(ctx, roomIds) {
  const reads = await ChatRead.find({ businessId: ctx.businessId, userId: ctx.userId }).select("room lastReadAt");
  const seen = new Map(reads.map((r) => [r.room, r.lastReadAt]));
  const rows = await ChatMessage.aggregate([
    {
      $match: {
        businessId: ctx.businessId,
        senderUserId: { $ne: ctx.userId },
        $or: roomIds.map((room) => ({ room, createdAt: { $gt: seen.get(room) || new Date(0) } })),
      },
    },
    { $group: { _id: "$room", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id, r.n]));
}

async function allRooms(ctx) {
  const team = await teamOf(ctx);
  const me = String(ctx.userId);
  const rooms = [
    { id: "team", kind: "team", title: "Team chat", subtitle: `${team.length} ${team.length === 1 ? "person" : "people"}` },
    ...team
      .filter((t) => t.id !== me)
      .map((t) => ({ id: dmRoom(me, t.id), kind: "dm", title: t.name, role: t.role, subtitle: t.role === "staff" ? "sales rep" : t.role })),
  ];
  return { team, rooms };
}

// GET /api/chat/rooms — the team room and one conversation per colleague, with the latest line and unread count.
chatRouter.get("/rooms", async (req, res) => {
  const { rooms } = await allRooms(req.ctx);
  const ids = rooms.map((r) => r.id);
  const [unread, last] = await Promise.all([
    unreadByRoom(req.ctx, ids),
    ChatMessage.aggregate([
      { $match: { businessId: req.ctx.businessId, room: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$room", at: { $first: "$createdAt" }, text: { $first: "$text" }, by: { $first: "$senderName" } } },
    ]),
  ]);
  const lastBy = new Map(last.map((l) => [l._id, l]));
  const stamp = (r) => (r.last?.at ? new Date(r.last.at).getTime() : 0);
  res.json({
    me: String(req.ctx.userId),
    rooms: rooms
      .map((r) => {
        const l = lastBy.get(r.id);
        return { ...r, unread: unread.get(r.id) || 0, last: l ? { at: l.at, text: l.text, by: l.by } : null };
      })
      // Team first, then the conversations with something in them (newest first), then the rest in role order.
      .sort((a, b) => (a.kind === "team" ? -1 : b.kind === "team" ? 1 : stamp(b) - stamp(a))),
  });
});

// GET /api/chat/unread — just the number, for the badge in the header.
chatRouter.get("/unread", async (req, res) => {
  const { rooms } = await allRooms(req.ctx);
  const unread = await unreadByRoom(req.ctx, rooms.map((r) => r.id));
  res.json({ unread: [...unread.values()].reduce((s, n) => s + n, 0) });
});

const shape = (m, meId) => ({
  id: String(m._id),
  room: m.room,
  senderId: String(m.senderUserId),
  senderName: m.senderName,
  senderRole: m.senderRole,
  text: m.text,
  at: m.createdAt,
  mine: String(m.senderUserId) === String(meId),
});

const markRead = (ctx, room) =>
  ChatRead.updateOne({ businessId: ctx.businessId, userId: ctx.userId, room }, { $set: { lastReadAt: new Date() } }, { upsert: true }).catch(() => {});

// GET /api/chat/messages?room=&since= — the latest messages, or only those after `since` when polling.
chatRouter.get("/messages", async (req, res) => {
  const room = String(req.query.room || "");
  const team = await teamOf(req.ctx);
  if (!roomAllowed(room, req.ctx.userId, team)) return res.status(404).json({ error: "not_found", message: "That conversation isn't available." });

  const since = req.query.since ? new Date(String(req.query.since)) : null;
  const filter = { businessId: req.ctx.businessId, room };
  let rows;
  if (since && !Number.isNaN(since.getTime())) {
    rows = await ChatMessage.find({ ...filter, createdAt: { $gt: since } }).sort({ createdAt: 1 }).limit(200);
  } else {
    rows = (await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(PAGE)).reverse();
  }
  await markRead(req.ctx, room);
  res.json({ messages: rows.map((m) => shape(m, req.ctx.userId)) });
});

const sendSchema = z.object({
  room: z.string(),
  text: z.string().trim().min(1, "Type a message first.").max(2000, "That message is too long."),
});

// POST /api/chat/messages — say something.
chatRouter.post("/messages", async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid", message: parsed.error.issues[0].message });
  if (!rateLimit(`chat:${req.ctx.userId}`, { max: 40, windowMs: 60_000 })) {
    return res.status(429).json({ error: "rate_limited", message: "You're sending messages very fast. Wait a moment." });
  }
  const { room, text } = parsed.data;
  const team = await teamOf(req.ctx);
  if (!roomAllowed(room, req.ctx.userId, team)) return res.status(404).json({ error: "not_found", message: "That conversation isn't available." });

  const msg = await ChatMessage.create({
    accountId: req.ctx.accountId,
    businessId: req.ctx.businessId,
    room,
    senderUserId: req.ctx.userId,
    senderName: req.ctx.actorName,
    senderRole: req.ctx.role,
    text,
  });
  await markRead(req.ctx, room);
  res.status(201).json({ message: shape(msg, req.ctx.userId) });
});
