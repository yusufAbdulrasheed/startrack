/**
 * Hotel / Guest House — the manifest for this business vertical.
 *
 * Capabilities (see server/shared/businessTypes.js): rooms, folio, kitchen.
 *
 *   rooms   → room.model.js, hotel.routes.js — a room is never stock, it's
 *             occupied across a date range (see room.model.js's own header).
 *   folio   → stay.model.js, hotel.routes.js — charges from any outlet
 *             (room/kitchen/bar/laundry/extras) accumulate on one bill,
 *             settled once at check-out.
 *   kitchen → hotel.routes.js's `/stays/:id/charge` — an outlet that posts
 *             a charge instead of taking cash. (Restaurant's own "kitchen
 *             order queue" is a different capability, `kitchenQueue` — see
 *             server/modules/businesses/restaurant/ — despite the similar
 *             name, the two aren't related.)
 *
 * Everything hotel-specific lives in this one directory: hotel.routes.js,
 * hotel.service.js, room.model.js, stay.model.js. It reaches into shared
 * core only where every business type does — Product (what's on the menu
 * to charge), Sale (checking out settles as an ordinary sale), Customer,
 * the inventory ledger (applyMovement), and metrics — never another
 * business type's own directory.
 */
export const HOTEL_COMPOSITION = {
  capabilities: ["rooms", "folio", "kitchen"],
  implementedIn: ["./hotel.routes.js", "./hotel.service.js", "./room.model.js", "./stay.model.js"],
};
