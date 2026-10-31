import { Router } from "express";
import { Invoice } from "#modules/invoices/invoice.model.js";
import { Business } from "#modules/business/business.model.js";
import { allow } from "#core/rateLimit.js";
import { shape } from "#modules/invoices/invoices.service.js";
import { businessFace } from "#modules/invoices/invoiceFace.js";
import { renderInvoicePdf } from "#modules/invoices/invoicePdf.js";

/**
 * /api/public/invoices/:token — what a customer opens from the link they were
 * sent. No login: the long random token IS the key, so it is checked for shape,
 * rate-limited, and an unknown token and a void one look the same from outside.
 * Nothing internal is sent: no ids, no cost, no staff names, no send history.
 */
export const invoicesPublicRouter = Router();

const TOKEN = /^[a-f0-9]{32}$/;

async function find(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || "x";
  if (!allow(res, `invoice:${ip}`, { max: 90, windowMs: 60_000 })) return null;
  const token = String(req.params.token || "");
  const inv = TOKEN.test(token) ? await Invoice.findOne({ shareToken: token, status: { $ne: "draft" } }) : null;
  if (!inv) { res.status(404).json({ error: "not_found", message: "This invoice isn't available." }); return null; }
  return inv;
}

function publicShape(inv) {
  const s = shape(inv);
  return {
    invoiceNo: s.invoiceNo, status: s.status, displayStatus: s.displayStatus, daysOverdue: s.daysOverdue,
    customer: { name: s.customer.name, email: s.customer.email, phone: s.customer.phone, address: s.customer.address },
    items: s.items, subtotal: s.subtotal, discount: s.discount, vatRate: s.vatRate, vat: s.vat, total: s.total, amountPaid: s.amountPaid, balance: s.balance,
    issueDate: s.issueDate, dueDate: s.dueDate, notes: s.notes, terms: s.terms,
    payments: s.payments.map((p) => ({ method: p.method, amount: p.amount, at: p.at })),
    voidInfo: s.status === "void" ? { at: s.voidInfo?.at } : undefined,
  };
}

invoicesPublicRouter.get("/:token", async (req, res) => {
  const inv = await find(req, res);
  if (!inv) return;
  // The first time it's opened, the owner is told it was seen.
  Invoice.updateOne({ _id: inv._id }, { $inc: { viewCount: 1 }, ...(inv.viewedAt ? {} : { $set: { viewedAt: new Date() } }) }).catch(() => {});
  const b = await Business.findById(inv.businessId);
  const face = businessFace(b);
  res.set("Cache-Control", "no-store");
  res.json({ invoice: publicShape(inv), business: { name: face.name, address: face.address, phone: face.phone, email: face.email, taxId: face.taxId, accent: face.accent, logoUrl: face.logoUrl, currency: face.currency, footer: face.footer }, bank: inv.status === "void" ? null : face.bank });
});

invoicesPublicRouter.get("/:token/pdf", async (req, res) => {
  const inv = await find(req, res);
  if (!inv) return;
  const b = await Business.findById(inv.businessId);
  const face = businessFace(b);
  const pdf = await renderInvoicePdf(shape(inv), face, face.currency);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNo}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});
