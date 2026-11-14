/**
 * Academy — demo data.
 *
 * `shop` is the sample business a visitor lands in (the demo picker and the
 * showcase accounts both read it): its catalogue, branch and a line saying what
 * to try. `seed` adds this business's own signature records on top of the
 * shared catalogue and trading history.
 */
import { Customer, postServicePayment, localDay, money } from "#platform/index.js";
import { Course } from "./course.model.js";
import { Intake } from "./intake.model.js";
import { Enrollment } from "./enrollment.model.js";
import { ClassSession } from "./classSession.model.js";

const shop = {
  label: "Tech Academy / Training School", group: "Education & Training", depth: "full",
  blurb: "Courses, classes and students — with the fees still owed.",
  business: "CodeBridge Academy",
  branch: { name: "Yaba Campus", address: "12 Herbert Macaulay Way, Yaba" },
  highlight: "Frontend, Backend, SQL, Power BI… with live classes, fee balances and attendance",
  catalog: [
    { name: "Registration Fee", category: "Registration & Exam Fees", price: 10000, service: true },
    { name: "Frontend Development (3 months)", category: "Tuition", price: 150000, service: true },
    { name: "Backend Development (3 months)", category: "Tuition", price: 180000, service: true },
    { name: "Data Analysis with SQL & Power BI", category: "Tuition", price: 120000, service: true },
    { name: "Weekend Workshop", category: "Workshops & Short Courses", price: 25000, service: true },
    { name: "Exam & Assessment Fee", category: "Registration & Exam Fees", price: 8000, service: true },
    { name: "Certificate of Completion", category: "Certificates", price: 5000, service: true },
    { name: "One-on-one Mentoring (1 hr)", category: "Consulting", price: 15000, service: true },
  ],
};

const DAY = 86_400_000;
const ago = (days, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 15, 0, 0);
  return d;
};
const dstr = (offsetDays) => localDay(new Date(Date.now() + offsetDays * DAY));
const mkCustomers = (base, list) =>
  Promise.all(list.map(([name, phone]) => Customer.create({ ...base, name, phone, whatsapp: phone })));

// ── Training academy ─────────────────────────────────────────────────

const COURSES = [
  ["Frontend Development", "Web", "beginner", "hybrid", 8, 120000],
  ["Backend Development", "Web", "intermediate", "hybrid", 8, 130000],
  ["Fullstack Web Development", "Web", "intermediate", "hybrid", 16, 250000],
  ["React", "Web", "intermediate", "online", 6, 90000],
  ["Node.js", "Web", "intermediate", "online", 6, 90000],
  ["React Native", "Mobile", "intermediate", "hybrid", 8, 120000],
  ["SQL", "Data", "beginner", "online", 4, 60000],
  ["Excel for Business", "Data", "beginner", "physical", 4, 45000],
  ["Power BI", "Data", "intermediate", "hybrid", 5, 75000],
  ["SPSS", "Data", "beginner", "physical", 4, 55000],
  ["R Programming", "Data", "intermediate", "online", 6, 70000],
  ["Python for Data Analysis", "Data", "beginner", "hybrid", 6, 85000],
];

async function seedAcademyDemo({ base, branch, ctx }) {
  const students = await mkCustomers(base, [
    ["Tolu Adeyemi", "08021110001"], ["Chiamaka Eze", "08021110002"], ["Ibrahim Sani", "08021110003"],
    ["Ngozi Okafor", "08021110004"], ["Seun Balogun", "08021110005"], ["Aisha Bello", "08021110006"],
    ["Kelechi Nwosu", "08021110007"], ["Funmi Alabi", "08021110008"], ["David Okon", "08021110009"],
    ["Zainab Musa", "08021110010"], ["Emeka Obi", "08021110011"], ["Halima Yusuf", "08021110012"],
  ]);
  const courses = {};
  for (const [name, category, level, mode, durationWeeks, fee] of COURSES) {
    courses[name] = await Course.create({ ...base, name, category, level, mode, durationWeeks, fee, description: `${name} — practical, project-based training.` });
  }

  const mkIntake = (course, name, start, end, schedule, tutor, capacity, status, planned, feeOverride) =>
    Intake.create({
      ...base, branchId: branch._id, courseId: courses[course]._id, courseName: course, name,
      startDate: dstr(start), endDate: dstr(end), schedule, tutor, mode: courses[course].mode,
      capacity, fee: feeOverride ?? courses[course].fee, plannedSessions: planned, status,
    });

  const excel = await mkIntake("Excel for Business", "Excel for Business — Weekend", -40, -12, "Sat, 10am–1pm", "Mrs. Adaobi Cole", 15, "completed", 4);
  const fullstack = await mkIntake("Fullstack Web Development", "Fullstack — Evening Class", -24, 88, "Mon, Wed & Fri, 6–8pm", "Mr. Tunde Bakare", 18, "running", 48);
  const sql = await mkIntake("SQL", "SQL — Online Cohort", -16, 12, "Tue & Thu, 7–9pm", "Ms. Kemi Ojo", 25, "running", 8);
  const powerbi = await mkIntake("Power BI", "Power BI — Weekend", -9, 26, "Sat, 10am–2pm", "Mrs. Adaobi Cole", 12, "running", 5);
  await mkIntake("React Native", "React Native — Evening Class", 9, 65, "Tue & Thu, 6–8pm", "Mr. Tunde Bakare", 14, "upcoming", 16);
  await mkIntake("SPSS", "SPSS — Weekend", 20, 48, "Sat, 11am–2pm", "Dr. Bisi Alade", 10, "upcoming", 4, 50000);

  // [student index, intake, discount, instalments as [days ago, amount, method]]
  const plan = [
    [0, excel, 0, [[44, 45000, "transfer"]], "completed", true],
    [1, excel, 0, [[44, 25000, "cash"], [30, 20000, "cash"]], "completed", true],
    [2, excel, 5000, [[43, 40000, "pos"]], "completed", false],
    [3, fullstack, 0, [[28, 120000, "transfer"], [10, 130000, "transfer"]]],
    [4, fullstack, 25000, [[27, 100000, "pos"]]],
    [5, fullstack, 0, [[26, 80000, "cash"]]],
    [6, fullstack, 0, []],
    [7, sql, 0, [[20, 60000, "transfer"]]],
    [8, sql, 0, [[19, 30000, "cash"]]],
    [9, sql, 10000, [[19, 50000, "transfer"]]],
    [0, powerbi, 0, [[12, 40000, "pos"]]],
    [10, powerbi, 0, [[11, 75000, "transfer"]]],
    [11, powerbi, 0, [[10, 25000, "cash"]]],
  ];
  const enrollments = [];
  for (const [si, intake, discount, payments, status = "enrolled", cert = false] of plan) {
    const student = students[si];
    const fee = money(intake.fee - discount);
    const e = await Enrollment.create({
      ...base, branchId: branch._id, intakeId: intake._id, intakeName: intake.name,
      courseId: intake.courseId, courseName: intake.courseName,
      customerId: student._id, studentName: student.name, studentPhone: student.phone,
      listFee: intake.fee, discount, fee, status, certificateIssued: cert,
      enrolledAt: ago(payments[0]?.[0] ?? 5),
    });
    let first = true;
    for (const [daysAgo, amount, method] of payments) {
      const fresh = await Customer.findById(student._id);
      const posted = await postServicePayment(ctx, {
        kind: "academy", refId: e._id, customer: fresh, countVisit: first, at: ago(daysAgo),
        label: `${intake.courseName} — tuition`, payments: [{ method, amount }],
      });
      first = false;
      e.amountPaid = money(e.amountPaid + posted.amount);
      e.payments.push({ saleId: posted.sale._id, saleNo: posted.sale.saleNo, amount: posted.amount, method, at: ago(daysAgo), byName: "Demo Owner" });
    }
    await e.save();
    enrollments.push({ e, intake });
  }

  // Attendance: a session every few days per running/completed class, with the
  // odd absence so the attendance rate isn't a flat 100%.
  const classes = [
    [excel, [41, 34, 27, 20]],
    [fullstack, [23, 21, 18, 16, 14, 11, 9, 7, 4, 2]],
    [sql, [15, 13, 8, 6, 1]],
    [powerbi, [8, 1]],
  ];
  const topics = ["Introduction & setup", "Core concepts", "Hands-on lab", "Project work", "Review & Q&A"];
  for (const [intake, daysAgoList] of classes) {
    const roster = enrollments.filter((r) => String(r.intake._id) === String(intake._id)).map((r) => r.e);
    for (let i = 0; i < daysAgoList.length; i++) {
      await ClassSession.create({
        accountId: base.accountId, businessId: base.businessId, intakeId: intake._id,
        date: dstr(-daysAgoList[i]), topic: topics[i % topics.length], tutor: intake.tutor, recordedByName: intake.tutor,
        attendance: roster.map((e, k) => ({ enrollmentId: e._id, studentName: e.studentName, present: (i + k) % 5 !== 0 })),
      });
    }
  }
}

// ── Salon ────────────────────────────────────────────────────────────


export const demo = {
  shop,
  // Courses, an intake with students enrolled, fees part-paid through the real payment code.
  async seed({ ctx, base, branch }) {
    await seedAcademyDemo({ base, branch, ctx });
  },
  // The 24-hour demo sandbox gets the same school.
  async sandbox({ ctx, base, branch }) {
    await seedAcademyDemo({ base, branch, ctx });
  },
};
