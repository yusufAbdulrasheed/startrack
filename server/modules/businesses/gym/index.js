/**
 * Fitness Gym — the manifest for this business vertical.
 *
 * Capability (see server/shared/businessTypes.js): memberships.
 *
 *   memberships (capability) → gym.routes.js + gymPlan.model.js +
 *     gymSubscription.model.js + gymCheckIn.model.js (this directory).
 *     Genuinely a new pattern, unlike laundry (reuses server/modules/jobs/
 *     wholesale) or supermarket (plain retail, no capability at all):
 *     recurring access rather than a one-off sale. Buying or renewing a
 *     plan still converts into a real Sale — same revenue-recognition and
 *     DailyMetric shape as every other checkout in this app — but its
 *     side effect is extending GymSubscription.expiresAt, never a stock
 *     movement (a membership has no Inventory row).
 *
 *   Check-in deliberately does NOT invent a second QR system: it reuses
 *   server/modules/loyalty/loyaltyCard.model.js wholesale — a member's
 *   loyalty card IS their check-in card, issued immediately on signup
 *   (bypassing the loyalty module's own "consistent patronage" rule, since
 *   here access control is the product being sold, not a reward for it).
 *
 *   Renewal reminders piggyback on the existing alert sweep/digest
 *   (server/modules/alerts/alerts.service.js's scanGymExpiries), the same
 *   scheduler every other alert already uses — never a second cron.
 */
export const GYM_COMPOSITION = {
  capabilities: ["memberships"],
  implementedIn: [
    "./gym.routes.js",
    "./gymPlan.model.js",
    "./gymSubscription.model.js",
    "./gymCheckIn.model.js",
    "#modules/loyalty/loyaltyCard.model.js (check-in card, reused)",
    "#modules/alerts/alerts.service.js (scanGymExpiries)",
  ],
};
