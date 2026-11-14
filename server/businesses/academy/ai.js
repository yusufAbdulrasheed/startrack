/**
 * Academy — what the AI assistant knows about this business.
 *
 * `brief` states how the business actually makes money, the words its owner
 * uses and the mistakes a generic retail assistant would make here. `modules`
 * are the screens only this business has, each with who may ask about it, a
 * guide to advising on it, and a builder returning the live facts behind it
 * (compact: top-N lists, counts, percentages). `snapshot` names the screens
 * whose data rides along with the whole-business overview (a key may be a
 * platform screen, e.g. "jobs").
 */
import { buildAcademyOverview } from "./academy.routes.js";
import { Intake } from "./intake.model.js";
import { Enrollment } from "./enrollment.model.js";

const can = (ctx, ...perms) => ctx.perms.includes("*") || perms.some((p) => ctx.perms.includes(p));

async function buildAcademy(ctx) {
  const open = await Intake.find({ businessId: ctx.businessId, status: { $in: ["upcoming", "running"] } }).sort({ startDate: 1 }).limit(12).lean();
  const overview = can(ctx, "dashboard_ops") ? await buildAcademyOverview(ctx) : null;
  if (overview) return overview;
  // Front-desk view: no fee totals, but seat availability is exactly what an
  // admissions person needs ("can I still take someone in this class?"). Say
  // "seatsTaken" and "seatsLeft" outright — a bare "seats" reads as either.
  const taken = await Enrollment.aggregate([
    { $match: { businessId: ctx.businessId, intakeId: { $in: open.map((i) => i._id) }, status: { $ne: "dropped" } } },
    { $group: { _id: "$intakeId", n: { $sum: 1 } } },
  ]);
  const takenBy = new Map(taken.map((t) => [String(t._id), t.n]));
  return {
    openClasses: open.map((i) => {
      const n = takenBy.get(String(i._id)) || 0;
      return { name: i.name, status: i.status, starts: i.startDate, tutor: i.tutor, capacity: i.capacity, seatsTaken: n, seatsLeft: Math.max(0, i.capacity - n) };
    }),
  };
}

export const ai = {
  brief: `TRAINING ACADEMY / TECH SCHOOL (Frontend, Backend, Fullstack, React, Node.js, React Native, SQL, Excel, Power BI, SPSS, R, Python…). Sells SEATS in scheduled classes, never stock. Structure: Course (what's taught, list fee) → Intake/class (one scheduled run: dates, tutor, capacity, its own fee, status upcoming/running/completed/cancelled) → Enrollment (a student's seat plus their FEE ACCOUNT: fee after discount, instalments paid, balance owed) → Sessions with attendance. A full class refuses new students; a student can't be enrolled twice; completing a course requires the fee settled; dropping frees the seat and writes off the unpaid balance (money already paid is kept). Income is recognised as each instalment is received. Watch: fees outstanding and who owes most, collection rate, seat fill (empty seats in upcoming classes = lost revenue; full classes = demand for another intake), attendance rate (low attendance predicts dropouts), completion vs drop-out rate, which courses earn most, tutor load. Words: students, classes/cohorts, tuition, instalments.`,
  modules: {
    academy: {
      label: "Academy", perms: ["sales", "dashboard_ops"], build: buildAcademy,
      guide: "The school. Cover fee collection (who owes), seat fill per class, attendance, completion and which courses earn most. Suggest concrete next steps: chase named students, add an intake for a full class, promote a class with empty seats.",
      howTo: "Courses tab: add courses with fees. Classes tab: schedule a class (course, dates, tutor, seats, fee), open it to enrol students (with an optional first payment), take attendance, and set its status. Students tab: search; open a student to take an instalment, reverse a payment, mark complete, drop, or issue a certificate.",
    },
  },
  snapshot: ["academy"],
};
