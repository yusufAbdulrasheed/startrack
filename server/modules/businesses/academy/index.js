/**
 * Training Academy / Tech School — the manifest for this business vertical.
 *
 * Capability (see server/shared/businessTypes.js): programs.
 *
 * A school sells seats in scheduled classes, not stock, so nothing here
 * touches Inventory. The model is:
 *
 *   Course  → what is taught (Frontend, SQL, Power BI…) and its list fee.
 *   Intake  → one scheduled run of a course: dates, tutor, capacity, its own fee.
 *   Enrollment → a student's seat in an intake plus their FEE ACCOUNT: the
 *               total owed, the instalments paid, the balance. Dropping a
 *               student frees the seat and writes off the unpaid balance.
 *   ClassSession → one held class and who was present, giving attendance %.
 *
 * Money still behaves like every other business: each instalment becomes an
 * ordinary Sale (service.kind = "academy") and bumps the same DailyMetric,
 * via the shared server/modules/services/servicePayment.js — so the
 * Dashboard, History and AI see tuition income with no special cases. A
 * refund is reverseServicePayment(), never the stock-based void.
 *
 * GET /api/academy/overview is the "how is the school going" read: active
 * students, fees billed vs collected, who owes what, seat fill per class,
 * attendance and completion rates, revenue by course.
 */
export const ACADEMY_COMPOSITION = {
  capabilities: ["programs"],
  implementedIn: [
    "./academy.routes.js",
    "./course.model.js",
    "./intake.model.js",
    "./enrollment.model.js",
    "./classSession.model.js",
    "#modules/services/servicePayment.js (fees → Sales/DailyMetric)",
  ],
};
