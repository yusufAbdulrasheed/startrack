import { Router } from "express";
import multer from "multer";
import { Customer } from "#modules/customers/customer.model.js";
import { requirePerm, limitProblem } from "#core/middleware/tenant.js";
import { parseUpload, UploadError, MAX_FILE_BYTES } from "#modules/imports/parseSheet.js";
import { guessColumns, cleanMapping, bestTable } from "#modules/imports/columns.js";
import { clean } from "#modules/imports/values.js";
import { customerRoom } from "#modules/customers/customerLimit.js";
import { ownerBranchForNew } from "#core/branchScope.js";
import { audit } from "#core/audit.js";

/**
 * Upload a customer list from Excel or CSV. The same route previews and saves:
 * without `commit=1` nothing is written and the answer says exactly what WOULD
 * happen, so nobody has to trust a file blindly. The file is read again on
 * commit — the server never accepts rows from the browser.
 *
 * The plan's customer limit is respected: customers beyond it are reported, not
 * silently dropped.
 */
export const customersImportRouter = Router();

const MAX_ROWS = 5000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

const SPEC = {
  name: ["name", "full name", "customer", "customer name", "client", "client name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "tel", "telephone", "gsm", "whatsapp", "contact"],
  email: ["email", "email address", "e-mail", "mail"],
  address: ["address", "location", "delivery address"],
  notes: ["notes", "note", "remarks", "comment", "comments"],
};

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const tail10 = (v) => digits(v).slice(-10);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Excel turns 08031234567 into the number 8031234567; put the zero back. */
function phoneOf(v) {
  if (v === "" || v === null || v === undefined) return "";
  let s = typeof v === "number" ? String(Math.round(v)) : String(v).trim();
  s = s.replace(/[\s\-().]/g, "");
  if (/^\d{10}$/.test(s)) s = `0${s}`;
  return s;
}

customersImportRouter.post("/", requirePerm("customers"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "invalid", message: "Choose a file to upload." });
  let parsed;
  try {
    parsed = await parseUpload(req.file.buffer, req.file.originalname, { maxRows: MAX_ROWS });
  } catch (err) {
    if (err instanceof UploadError) return res.status(400).json({ error: "bad_file", message: err.message });
    throw err;
  }

  const table = bestTable(parsed.tables, SPEC);
  const guess = guessColumns(table.headers, SPEC);
  const mapping = { ...guess, ...cleanMapping(req.body.mapping, table.headers, SPEC) };
  if (!mapping.name && !mapping.phone) {
    return res.status(422).json({ error: "no_columns", message: "I couldn't tell which column holds the names or phone numbers. Choose them below.", headers: table.headers, mapping });
  }

  // Who the business already has, to skip people who are already in the book.
  const existing = await Customer.find({ businessId: req.ctx.businessId }).select("name phone email").lean();
  const phones = new Set(existing.map((c) => tail10(c.phone)).filter((t) => t.length >= 7));
  const emails = new Set(existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean));
  // A row with only a name has nothing else to match on, so the name itself is the identity.
  const nameOnly = new Set(existing.filter((c) => !c.phone && !c.email).map((c) => clean(c.name).toLowerCase()));
  const room = await customerRoom(req.ctx.businessId, req.ctx.plan);

  const cell = (row, field) => (mapping[field] ? row[mapping[field]] : "");
  const adds = [];
  const problems = [];
  const tally = { rows: table.rows.length, add: 0, duplicate: 0, invalid: 0, overLimit: 0 };
  let remaining = room.remaining;

  for (const row of table.rows) {
    const phone = phoneOf(cell(row, "phone"));
    const emailRaw = clean(cell(row, "email"), 120).toLowerCase();
    const email = EMAIL.test(emailRaw) ? emailRaw : "";
    const name = clean(cell(row, "name"), 120) || (phone ? phone : "");
    if (!name) { tally.invalid++; problems.push({ row: row.__row, reason: "No name or phone number" }); continue; }
    if (phone && digits(phone).length < 7) { tally.invalid++; problems.push({ row: row.__row, reason: `"${phone}" doesn't look like a phone number` }); continue; }

    const t = phone ? tail10(phone) : "";
    const bare = !t && !email; // nothing but a name
    if ((t && phones.has(t)) || (email && emails.has(email)) || (bare && nameOnly.has(name.toLowerCase()))) { tally.duplicate++; continue; }
    if (remaining <= 0) { tally.overLimit++; continue; }

    if (t) phones.add(t);
    if (email) emails.add(email);
    if (bare) nameOnly.add(name.toLowerCase());
    remaining--;
    tally.add++;
    adds.push({ name, phone, email, address: clean(cell(row, "address"), 250), notes: clean(cell(row, "notes"), 500), row: row.__row });
  }

  const report = {
    fileName: req.file.originalname,
    sheet: table.name,
    headers: table.headers,
    mapping,
    truncated: table.truncated,
    totals: tally,
    room: { cap: room.cap, count: room.count, remaining: room.remaining === Infinity ? null : room.remaining },
    sample: adds.slice(0, 8).map(({ name, phone, email }) => ({ name, phone, email })),
    problems: problems.slice(0, 25),
    committed: false,
    created: 0,
  };
  if (tally.overLimit) {
    report.limit = limitProblem(req.ctx.plan, "customers", room.count, tally.add + tally.overLimit) || undefined;
  }

  if (req.body.commit !== "1") return res.json(report);

  const branchId = await ownerBranchForNew(req.ctx);
  const now = new Date();
  const docs = adds.map((a) => ({
    accountId: req.ctx.accountId, businessId: req.ctx.businessId, branchId,
    name: a.name, phone: a.phone, whatsapp: a.phone, email: a.email, address: a.address, notes: a.notes, source: "import", firstSeen: now, lastSeen: now,
  }));
  for (let i = 0; i < docs.length; i += 500) await Customer.insertMany(docs.slice(i, i + 500), { ordered: false });
  audit(req.ctx, "customers.import", { type: "business", id: req.ctx.businessId, label: req.file.originalname }, undefined, { created: docs.length, duplicates: tally.duplicate, overLimit: tally.overLimit });
  res.json({ ...report, committed: true, created: docs.length });
});
