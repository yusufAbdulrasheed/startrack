import mongoose from "mongoose";
import { Customer } from "#modules/customers/customer.model.js";
import { Course } from "#modules/businesses/academy/course.model.js";
import { Intake } from "#modules/businesses/academy/intake.model.js";
import { Enrollment } from "#modules/businesses/academy/enrollment.model.js";
import { ClassSession } from "#modules/businesses/academy/classSession.model.js";
import { SalonService } from "#modules/businesses/salon/salonService.model.js";
import { Appointment } from "#modules/businesses/salon/appointment.model.js";
import { Project } from "#modules/businesses/agency/project.model.js";
import { postServicePayment } from "#modules/services/servicePayment.js";
import { nextSeq } from "#core/counters.js";
import { localDay } from "#modules/metrics/metrics.service.js";
import { money } from "#core/money.js";

/**
 * Seeds for the three service-business demo sandboxes (see demoShops.js).
 * Every payment goes through the real postServicePayment(), so the sandbox's
 * Sales, DailyMetrics and customer totals are produced by exactly the code a
 * live business runs — not hand-written rows that could drift from it.
 */

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

export async function seedAcademyDemo({ base, branch, ctx }) {
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

const SERVICES = [
  ["Haircut (Men)", "Hair", 3000, 30], ["Haircut + Beard", "Hair", 4500, 45], ["Kids Cut", "Hair", 2500, 25],
  ["Wash & Blow-dry", "Hair", 5000, 45], ["Braids (Medium)", "Hair", 18000, 180], ["Knotless Braids", "Hair", 25000, 240],
  ["Hair Colour", "Hair", 15000, 120], ["Relaxer & Style", "Hair", 12000, 120], ["Loc Maintenance", "Hair", 10000, 90],
  ["Manicure", "Nails", 5000, 45], ["Pedicure", "Nails", 6000, 60], ["Gel Nails", "Nails", 9000, 75],
  ["Facial", "Skin", 12000, 60], ["Full Body Massage", "Spa", 20000, 90], ["Waxing (Full Leg)", "Skin", 8000, 45],
];

export async function seedSalonDemo({ base, branch, ctx }) {
  const clients = await mkCustomers(base, [
    ["Adaeze Umeh", "08031110001"], ["Bimpe Coker", "08031110002"], ["Chinedu Eke", "08031110003"],
    ["Damilola Ajayi", "08031110004"], ["Esther Ibe", "08031110005"], ["Femi Johnson", "08031110006"],
    ["Grace Obi", "08031110007"], ["Hassan Lawal", "08031110008"], ["Ifeoma Nnaji", "08031110009"],
  ]);
  const svc = {};
  for (const [name, category, price, durationMins] of SERVICES) {
    svc[name] = await SalonService.create({ ...base, name, category, price, durationMins });
  }
  const providers = ["Funke", "Tobi", "Ada", "Emeka"];

  const at = (dayOffset, hour, min = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return d;
  };

  async function book({ client, names, provider, when, status = "booked", deposit = 0, discount = 0, cancelReason = "" }) {
    const items = names.map((n) => ({ serviceId: svc[n]._id, name: n, price: svc[n].price, durationMins: svc[n].durationMins }));
    const durationMins = items.reduce((s, i) => s + i.durationMins, 0);
    const total = money(items.reduce((s, i) => s + i.price, 0));
    const _id = new mongoose.Types.ObjectId();
    const customer = await Customer.findById(client._id);
    let dep = { amount: 0 };
    if (deposit) {
      const p = await postServicePayment(ctx, {
        kind: "salon", refId: _id, customer, at: new Date(when.getTime() - DAY),
        label: `Booking deposit — ${names.join(", ")}`, payments: [{ method: "transfer", amount: deposit }],
      });
      dep = { amount: deposit, method: "transfer", saleId: p.sale._id, saleNo: p.sale.saleNo };
    }
    const doc = {
      _id, ...base, branchId: branch._id, customerId: client._id, customerName: client.name, customerPhone: client.phone,
      items, provider, startsAt: when, endsAt: new Date(when.getTime() + durationMins * 60_000), durationMins, total,
      deposit: dep, status, amountPaid: dep.amount, bookedByName: "Demo Owner", cancelReason,
    };
    if (status === "completed") {
      const finalTotal = money(total - discount);
      const due = money(finalTotal - dep.amount);
      const fresh = await Customer.findById(client._id);
      if (due > 0) {
        const p = await postServicePayment(ctx, {
          kind: "salon", refId: _id, customer: fresh, countVisit: true, at: when,
          label: names.join(", "), payments: [{ method: due % 2 ? "cash" : "pos", amount: due }],
        });
        doc.balanceSaleId = p.sale._id;
        doc.balanceSaleNo = p.sale.saleNo;
      }
      Object.assign(doc, { discount, amountPaid: finalTotal, completedAt: new Date(when.getTime() + durationMins * 60_000) });
    }
    return Appointment.create(doc);
  }

  // Two weeks of finished work, spread over the providers.
  const history = [
    ["Haircut (Men)"], ["Haircut + Beard"], ["Wash & Blow-dry"], ["Manicure", "Pedicure"], ["Braids (Medium)"],
    ["Facial"], ["Hair Colour"], ["Gel Nails"], ["Full Body Massage"], ["Kids Cut"], ["Relaxer & Style"], ["Haircut (Men)"],
  ];
  let n = 0;
  for (let d = 13; d >= 1; d--) {
    const visits = 2 + (d % 3);
    for (let v = 0; v < visits; v++) {
      const names = history[n % history.length];
      await book({
        client: clients[n % clients.length], names, provider: providers[n % providers.length],
        when: at(-d, 9 + v * 3), status: "completed", discount: n % 7 === 0 ? 500 : 0,
      });
      n++;
    }
  }
  await book({ client: clients[2], names: ["Haircut (Men)"], provider: "Tobi", when: at(-3, 15), status: "no_show" });
  await book({ client: clients[5], names: ["Facial"], provider: "Ada", when: at(-2, 13), status: "cancelled", cancelReason: "Client travelled" });

  // Today: some done, one on the chair, the rest to come.
  await book({ client: clients[0], names: ["Wash & Blow-dry"], provider: "Funke", when: at(0, 8, 30), status: "completed" });
  await book({ client: clients[3], names: ["Haircut + Beard"], provider: "Tobi", when: at(0, 9), status: "completed" });
  await book({ client: clients[4], names: ["Braids (Medium)"], provider: "Ada", when: at(0, 9, 30), status: "in_progress", deposit: 5000 });
  // "Later today" must stay today: opened in the evening, "90 minutes from now"
  // would roll past midnight and the demo would look emptier than it promises.
  const lastSlot = new Date();
  lastSlot.setHours(23, 0, 0, 0);
  const todayOnly = (d) => (d > lastSlot ? new Date(lastSlot) : d);
  const soon = new Date(Date.now() + 90 * 60_000);
  soon.setMinutes(0, 0, 0);
  await book({ client: clients[6], names: ["Manicure", "Pedicure"], provider: "Funke", when: todayOnly(soon) });
  await book({ client: clients[7], names: ["Haircut (Men)"], provider: "Emeka", when: todayOnly(new Date(soon.getTime() + 2 * 3600_000)) });
  await book({ client: clients[8], names: ["Knotless Braids"], provider: "Ada", when: at(1, 10), deposit: 8000 });
  await book({ client: clients[1], names: ["Hair Colour", "Wash & Blow-dry"], provider: "Funke", when: at(2, 11), deposit: 5000 });
}

// ── Agency ───────────────────────────────────────────────────────────

export async function seedAgencyDemo({ base, branch, ctx }) {
  const clients = await mkCustomers(base, [
    ["Lagos Fresh Foods Ltd", "08041110001"], ["Brightpath Schools", "08041110002"],
    ["Ocean Logistics", "08041110003"], ["Dr. Amina Garba", "08041110004"], ["Greenfield Estates", "08041110005"],
  ]);

  async function project({ client, title, type, lead, budget, status, start, due, milestones = [], payments = [], hours = [] }) {
    const customer = await Customer.findById(client._id);
    const seq = await nextSeq(`project:${base.businessId}`);
    const p = new Project({
      ...base, branchId: branch._id, projectNo: `P-${String(seq).padStart(4, "0")}`,
      customerId: customer._id, clientName: customer.name, title, type, lead, budget, status,
      startDate: start ? dstr(start) : "", dueDate: due ? dstr(due) : "",
      milestones: milestones.map(([t, amount, dueOffset, done]) => ({
        title: t, amount, dueDate: dstr(dueOffset), status: done ? "done" : "pending", doneAt: done ? ago(Math.max(0, -dueOffset)) : undefined,
      })),
      timeLogs: hours.map(([daysAgo, who, h, note]) => ({ date: dstr(-daysAgo), who, hours: h, note })),
      completedAt: status === "completed" ? ago(5) : undefined,
    });
    let first = true;
    for (const [daysAgo, amount, method, note] of payments) {
      const fresh = await Customer.findById(client._id);
      const posted = await postServicePayment(ctx, {
        kind: "agency", refId: p._id, customer: fresh, countVisit: first, at: ago(daysAgo),
        label: `${p.projectNo} ${title}${note ? ` — ${note}` : ""}`, payments: [{ method, amount }],
      });
      first = false;
      p.amountPaid = money(p.amountPaid + posted.amount);
      p.payments.push({ saleId: posted.sale._id, saleNo: posted.sale.saleNo, amount: posted.amount, method, note, at: ago(daysAgo), byName: "Demo Owner" });
    }
    await p.save();
    return p;
  }

  await project({
    client: clients[0], title: "Online ordering web app", type: "Web App", lead: "Tunde", budget: 1_200_000, status: "active", start: -40, due: 20,
    milestones: [["Design & prototype", 300_000, -28, true], ["Customer app", 500_000, -5, true], ["Admin dashboard", 250_000, 8, false], ["Launch & handover", 150_000, 20, false]],
    payments: [[40, 400_000, "transfer", "Deposit"], [22, 300_000, "transfer", "Design milestone"]],
    hours: [[30, "Tunde", 8, "Wireframes"], [29, "Kemi", 6, "UI kit"], [14, "Tunde", 9, "Auth + orders API"], [6, "Tunde", 7.5, "Customer app polish"]],
  });
  await project({
    client: clients[1], title: "School results portal", type: "Web App", lead: "Kemi", budget: 850_000, status: "active", start: -60, due: -4,
    milestones: [["Requirements", 100_000, -50, true], ["Student & results module", 450_000, -15, true], ["Parent portal", 300_000, -4, false]],
    payments: [[58, 300_000, "transfer", "Deposit"]],
    hours: [[50, "Kemi", 10, "Discovery"], [20, "Kemi", 12, "Results import"], [12, "Tunde", 6, "Reports"]],
  });
  await project({
    client: clients[2], title: "Fleet tracking mobile app", type: "Mobile App", lead: "Tunde", budget: 1_800_000, status: "proposal", start: 0, due: 90,
    milestones: [["Discovery & design", 400_000, 14, false], ["Driver app", 800_000, 50, false], ["Dispatcher dashboard", 600_000, 80, false]],
  });
  await project({
    client: clients[3], title: "Clinic patient survey analysis", type: "Data Analysis", lead: "Kemi", budget: 220_000, status: "completed", start: -30, due: -6,
    milestones: [["Data cleaning", 70_000, -22, true], ["SPSS analysis & report", 150_000, -6, true]],
    payments: [[28, 100_000, "cash", "Deposit"], [5, 120_000, "transfer", "Final payment"]],
    hours: [[25, "Kemi", 9, "Cleaning"], [12, "Kemi", 11, "Analysis"]],
  });
  await project({
    client: clients[4], title: "Estate management dashboard", type: "Power BI", lead: "Kemi", budget: 450_000, status: "active", start: -12, due: 25,
    milestones: [["Data model", 150_000, 2, true], ["Dashboards", 200_000, 14, false], ["Training & handover", 100_000, 25, false]],
    payments: [[11, 150_000, "pos", "Deposit"]],
    hours: [[9, "Kemi", 8, "Data model"], [4, "Kemi", 5, "Dashboard draft"]],
  });
  await project({
    client: clients[0], title: "Brand website refresh", type: "Design", lead: "Tunde", budget: 350_000, status: "on_hold", start: -20, due: 30,
    milestones: [["Concepts", 120_000, -8, true], ["Build", 230_000, 30, false]],
    payments: [[18, 120_000, "transfer", "Concepts"]],
    hours: [[16, "Tunde", 6, "Concepts"]],
  });
}
