import { Room, RoomType } from "#modules/hotel/room.model.js";
import { Stay } from "#modules/hotel/stay.model.js";
import { money } from "#core/money.js";
import { badRequest } from "#core/httpError.js";

// Stays that actually hold a room. A cancelled or checked-out stay does not.
export const HOLDING = ["booked", "checked_in"];

export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const nightsBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000);

/** Every night in [from, to) — the nights a guest actually sleeps. */
export function nightsIn(from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function validateRange(checkIn, checkOut) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
    throw badRequest("Give both dates as YYYY-MM-DD.");
  }
  const nights = nightsBetween(checkIn, checkOut);
  if (nights < 1) throw badRequest("Check-out must be at least one night after check-in.");
  if (nights > 365) throw badRequest("That is longer than a year — split it into separate stays.");
  return nights;
}

/**
 * The overlap rule, in one place.
 *
 * Two ranges collide when each starts before the other ends. Because check-out
 * day is exclusive, a guest leaving on the 22nd and another arriving on the
 * 22nd do NOT clash — the room turns over the same day, which is exactly how
 * a real front desk works.
 */
export const overlapFilter = (checkIn, checkOut) => ({
  status: { $in: HOLDING },
  checkIn: { $lt: checkOut },
  checkOut: { $gt: checkIn },
});

/** Stays holding any room over a window, for the grid and for clash checks. */
export async function staysOverlapping(businessId, branchId, from, to, extra = {}) {
  return Stay.find({ businessId, branchId, ...overlapFilter(from, to), ...extra }).lean();
}

/** Is this specific room free for these nights? `ignoreStayId` allows editing. */
export async function isRoomFree(businessId, roomId, checkIn, checkOut, ignoreStayId = null) {
  const clash = await Stay.findOne({
    businessId,
    roomId,
    ...overlapFilter(checkIn, checkOut),
    ...(ignoreStayId ? { _id: { $ne: ignoreStayId } } : {}),
  }).select("folioNo guestName checkIn checkOut");
  return { free: !clash, clash };
}

/**
 * The heat map: every room, every night in the window, and what it is doing.
 *
 * Returned as a grid rather than a list of stays because that is how a front
 * desk reads it — rooms down the side, nights across the top, and the gaps
 * are the thing you are looking for.
 */
export async function availabilityGrid(businessId, branchId, from, to) {
  const [rooms, types, stays] = await Promise.all([
    Room.find({ businessId, branchId }).sort({ number: 1 }).lean(),
    RoomType.find({ businessId }).lean(),
    staysOverlapping(businessId, branchId, from, to),
  ]);

  const typeById = new Map(types.map((t) => [String(t._id), t]));
  const nights = nightsIn(from, to);

  // night -> stay, per room.
  const occupancy = new Map();
  for (const s of stays) {
    for (const night of nightsIn(s.checkIn, s.checkOut)) {
      if (night < from || night >= to) continue;
      occupancy.set(`${s.roomId}|${night}`, s);
    }
  }

  const grid = rooms.map((room) => {
    const type = typeById.get(String(room.roomTypeId));
    const cells = nights.map((night) => {
      const stay = occupancy.get(`${room._id}|${night}`);
      if (stay) {
        return {
          night,
          state: stay.status === "checked_in" ? "occupied" : "booked",
          stayId: stay._id,
          guestName: stay.guestName,
          folioNo: stay.folioNo,
          // So the UI can draw one continuous bar instead of separate blocks.
          arrival: night === stay.checkIn,
          departure: addDays(night, 1) === stay.checkOut,
        };
      }
      if (room.housekeeping === "out_of_service") return { night, state: "out_of_service" };
      // Housekeeping only describes the room right now, so it can only colour
      // tonight — a room that is dirty today will have been cleaned by Friday.
      if (room.housekeeping === "dirty" && night === nights[0]) return { night, state: "dirty" };
      return { night, state: "free" };
    });

    return {
      id: room._id,
      number: room.number,
      floor: room.floor,
      housekeeping: room.housekeeping,
      typeName: type?.name || "",
      rate: type?.rate ?? 0,
      capacity: type?.capacity ?? 2,
      cells,
    };
  });

  // Occupancy per night, which is the number a hotelier actually manages by.
  const sellable = rooms.filter((r) => r.housekeeping !== "out_of_service").length;
  const perNight = nights.map((night) => {
    const taken = grid.filter((r) => {
      const c = r.cells.find((x) => x.night === night);
      return c && (c.state === "occupied" || c.state === "booked");
    }).length;
    return { night, occupied: taken, sellable, pct: sellable ? Math.round((taken / sellable) * 100) : 0 };
  });

  return { rooms: grid, nights, occupancy: perNight, totals: { rooms: rooms.length, sellable } };
}

/** Folio arithmetic. VAT applies to the whole bill, once, at settlement. */
export function folioTotals(business, charges, discountInput = 0) {
  const subtotal = money(charges.reduce((s, c) => s + c.lineNet, 0));
  const discount = money(Math.min(discountInput, subtotal));
  const settings = business.settings || {};
  const vat = settings.vatEnabled ? money(((subtotal - discount) * settings.vatRate) / 100) : 0;
  return { subtotal, discount, vat, total: money(subtotal - discount + vat) };
}

export const shapeStay = (s, business, showCost = false) => {
  const totals = folioTotals(business, s.charges || [], s.discount || 0);
  const paid = money((s.payments || []).reduce((sum, p) => sum + p.amount, 0));
  return {
    id: s._id,
    folioNo: s.folioNo,
    roomId: s.roomId,
    roomNumber: s.roomNumber,
    roomTypeName: s.roomTypeName,
    guestName: s.guestName,
    guestPhone: s.guestPhone,
    guests: s.guests,
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    nights: s.nights,
    nightlyRate: s.nightlyRate,
    status: s.status,
    checkedInAt: s.checkedInAt || null,
    checkedOutAt: s.checkedOutAt || null,
    charges: (s.charges || []).map((c) => ({
      at: c.at, source: c.source, name: c.name, qty: c.qty,
      unitPrice: c.unitPrice, lineNet: c.lineNet, byName: c.byName,
      ...(showCost ? { lineCost: c.lineCost } : {}),
    })),
    payments: s.payments || [],
    ...totals,
    paid,
    balance: money(totals.total - paid),
    notes: s.notes,
    staffName: s.staffName,
    saleId: s.saleId || null,
  };
};
