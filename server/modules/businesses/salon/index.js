/**
 * Salon / Barber / Spa — the manifest for this business vertical.
 *
 * Capability (see server/shared/businessTypes.js): appointments.
 *
 * The thing being sold is a provider's TIME. So the core object is the
 * Appointment, and the core rule is that one provider can't be in two places:
 * booking or moving an appointment is refused if it overlaps another open one
 * for the same provider (see findClash in salon.routes.js).
 *
 *   SalonService → the menu: name, price, duration. No stock.
 *   Appointment  → customer + one or more services + provider + start/end.
 *                  Prices and durations are snapshotted at booking.
 *
 * Payment is two-stage, like a real salon: an optional deposit when booking
 * (revenue the day it arrives; kept on a cancel or no-show, since the slot is
 * lost) and the balance at completion, after any discount. Both are ordinary
 * Sales via server/modules/services/servicePayment.js.
 *
 * Retail products (shampoo, extensions) still use the normal catalog + POS.
 */
export const SALON_COMPOSITION = {
  capabilities: ["appointments"],
  implementedIn: [
    "./salon.routes.js",
    "./salonService.model.js",
    "./appointment.model.js",
    "#modules/services/servicePayment.js (deposit/balance → Sales/DailyMetric)",
  ],
};
