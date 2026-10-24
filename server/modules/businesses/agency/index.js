/**
 * Tech Agency / Freelance Studio — the manifest for this business vertical.
 *
 * Capability (see server/shared/businessTypes.js): projects.
 *
 * Work is agreed as a Project for a budget, delivered in Milestones, and
 * paid for in stages. Three numbers matter and the code keeps them apart:
 *
 *   budget      — the whole agreed price.
 *   earned      — the value of milestones marked delivered.
 *   amountPaid  — what the client has actually handed over.
 *
 * `dueNow` = earned − paid (or budget − paid once the project is complete):
 * what to invoice today. Milestones can't be assigned more than the budget,
 * and a budget can't be cut below what is paid or promised. Hours are logged
 * per project so the effective rate (paid ÷ hours) shows whether a fixed
 * price is actually paying.
 *
 * Payments are ordinary Sales via server/modules/services/servicePayment.js.
 */
export const AGENCY_COMPOSITION = {
  capabilities: ["projects"],
  implementedIn: [
    "./agency.routes.js",
    "./project.model.js",
    "#modules/services/servicePayment.js (payments → Sales/DailyMetric)",
  ],
};
