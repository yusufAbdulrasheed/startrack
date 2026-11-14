import { Course } from "./course.model.js";
import { money, importField, cell, isEmpty, clean, parseMoney, parseWeeks, normKey, pickChoice } from "#platform/index.js";

/**
 * The academy's own spreadsheet import: a list of courses with their fees.
 * Registered on the academy service (see service.js); the platform importer
 * offers it only to an academy and treats it as the academy's "my list".
 */

const COURSE_FIELDS = [
  importField("name", "Course name", ["course", "coursename", "name", "program", "programme", "title", "subject", "coursetitle", "module"], { required: true, exclude: "(code|id$|number|tutor|instructor|fee|price)" }),
  importField("fee", "Fee", ["fee", "fees", "price", "tuition", "cost", "amount", "coursefee", "tuitionfee", "charge", "rate"], { required: true }),
  importField("category", "Track / category", ["category", "track", "department", "area", "field", "school", "faculty", "stream", "discipline"]),
  importField("level", "Level", ["level", "difficulty", "stage", "grade"]),
  importField("mode", "Mode", ["mode", "delivery", "format", "deliverymode", "medium", "classtype"]),
  importField("durationWeeks", "Duration", ["duration", "durationweeks", "weeks", "length", "period", "courselength", "timeline", "term"]),
  importField("description", "Description", ["description", "details", "about", "summary", "outline", "overview", "synopsis", "content", "curriculum", "topics"]),
];

export const coursesTarget = {
  wordHint: /\b(course|courses|class(es)?|programme?s?|tuition|curriculum|syllabus)\b/i,
  key: "courses",
  perm: "prices",
  available: () => true, // only the academy registers this target
  label: () => "Courses",
  singular: "course",
  fields: () => COURSE_FIELDS,
  columns: [
    { key: "name", label: "Course", format: "text" },
    { key: "category", label: "Track", format: "text" },
    { key: "fee", label: "Fee", format: "money", align: "right" },
    { key: "weeksText", label: "Duration", format: "text", align: "right" },
    { key: "level", label: "Level", format: "text" },
  ],
  sample: ["Course", "Track", "Fee", "Duration (weeks)", "Level", "Mode", "Description"],
  sampleRows: [["Fullstack Web Development", "Web", 150000, 16, "Beginner", "Hybrid", "HTML to deployment"]],

  normalize(raw, mapping) {
    const notes = [];
    const name = clean(cell(raw, mapping, "name"), 120);
    if (name.length < 2) return { error: "No course name" };
    const fee = parseMoney(cell(raw, mapping, "fee"));
    if (fee === null || fee < 0) return { name, error: isEmpty(cell(raw, mapping, "fee")) ? "No fee" : "The fee isn't a number" };

    const levelRaw = cell(raw, mapping, "level");
    const level = pickChoice(levelRaw, { beginner: ["begin", "basic", "intro", "novice", "entry", "level1", "starter", "junior"], intermediate: ["inter", "mid", "level2", "medium"], advanced: ["advan", "expert", "pro", "senior", "level3", "master"] }) || "beginner";
    if (!isEmpty(levelRaw) && !pickChoice(levelRaw, { x: ["begin", "basic", "intro", "novice", "entry", "level1", "starter", "junior", "inter", "mid", "level2", "medium", "advan", "expert", "pro", "senior", "level3", "master"] })) notes.push(`Level “${clean(levelRaw, 20)}” wasn't recognised — set to beginner`);
    const modeRaw = cell(raw, mapping, "mode");
    const mode = pickChoice(modeRaw, { online: ["online", "virtual", "remote", "zoom", "elearn", "web"], physical: ["physical", "onsite", "inperson", "offline", "classroom", "campus", "onground"], hybrid: ["hybrid", "blend", "both", "mixed"] }) || "hybrid";

    let weeks = parseWeeks(cell(raw, mapping, "durationWeeks"));
    if (weeks === null) {
      weeks = 4;
      if (!isEmpty(cell(raw, mapping, "durationWeeks"))) notes.push("The duration wasn't clear — set to 4 weeks");
    }
    weeks = Math.min(weeks, 260);
    const category = clean(cell(raw, mapping, "category"), 60) || "General";
    const data = {
      name, category, fee: money(fee), level, mode, durationWeeks: weeks,
      description: clean(cell(raw, mapping, "description"), 1000),
    };
    data.weeksText = `${weeks} wk${weeks === 1 ? "" : "s"}`;
    return { data, notes };
  },
  keys: (d) => [`n:${normKey(d.name)}`],
  async existing(ctx) {
    const rows = await Course.find({ businessId: ctx.businessId }).select("name");
    return new Map(rows.map((c) => [`n:${normKey(c.name)}`, c.name]));
  },
  async env() { return {}; },
  async create(ctx, rows) {
    const docs = rows.map((d) => ({ accountId: ctx.accountId, businessId: ctx.businessId, name: d.name, category: d.category, level: d.level, mode: d.mode, durationWeeks: d.durationWeeks, fee: d.fee, description: d.description }));
    const created = await Course.insertMany(docs, { ordered: false });
    return { created: created.length, detail: "" };
  },
};
