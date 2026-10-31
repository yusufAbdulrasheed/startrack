import mongoose from "mongoose";
import { Business } from "#modules/business/business.model.js";
import { Branch } from "#modules/business/branch.model.js";
import { Product } from "#modules/products/product.model.js";
import { Inventory } from "#modules/inventory/inventory.model.js";
import { Account } from "#modules/auth/account.model.js";
import { User } from "#modules/auth/user.model.js";
import { hasCapability } from "#shared/businessTypes.js";
import { planAllows, effectivePlan } from "#shared/plans.js";
import { siteOf, SLUG_RE } from "#modules/site/site.service.js";
import { scopedToBranch } from "#core/branchScope.js";
import { money } from "#core/money.js";
import { raise, resolve } from "#modules/alerts/notify.js";
import { sendMail, emailShell, esc } from "#core/mailer.js";
import { escapeRegex } from "#core/regex.js";

/**
 * The online store: what a business may sell on its page, to whom, and from
 * which shelf. Everything a customer is allowed to see is shaped here, so the
 * rule "never expose cost, exact stock, other customers or internal ids" lives
 * in one file (the same promise site.service.js makes for the brochure page).
 */

// Trades whose product is not a shelf item: rooms, classes, appointments,
// memberships, projects. They have nothing to put in a basket.
const NOT_SHOPPABLE = ["rooms", "folio", "memberships", "programs", "appointments", "projects", "coldChain", "weighing"];
export const storefrontEligible = (typeKey) => !NOT_SHOPPABLE.some((c) => hasCapability(typeKey, c));

export const DEFAULT_STOREFRONT = {
  enabled: false, acceptingOrders: true, branchId: null,
  pickup: true, delivery: false, deliveryFee: 0, freeDeliveryOver: 0, minOrder: 0,
  payOnDelivery: true, payAtPickup: true, transfer: false,
  bankName: "", accountName: "", accountNumber: "", leadTime: "", instructions: "", deliveryAreas: "",
};

/** The business's store settings over safe defaults. */
export const storeOf = (b) => ({ ...DEFAULT_STOREFRONT, ...(siteOf(b).storefront || {}) });

export const businessLabel = (b) => b.tradingName || b.name;
export const orderNoFor = (seq) => `WEB-${String(seq).padStart(4, "0")}`;

/**
 * The business behind a store address — or null. Null covers every reason a
 * store can be closed (unknown, page off, store off, wrong trade, plan lapsed)
 * so a caller can't tell them apart and addresses can't be probed.
 */
export async function loadStore(slug) {
  slug = String(slug || "").toLowerCase();
  if (!SLUG_RE.test(slug)) return null;
  const b = await Business.findOne({ "site.slug": slug });
  if (!b || !siteOf(b).enabled || !storeOf(b).enabled || !storefrontEligible(b.typeKey)) return null;
  const account = await Account.findById(b.accountId).select("isSandbox subscription status");
  if (!account || account.status === "suspended" || !planAllows(effectivePlan(account), "sitePage")) return null;
  return b;
}

/** The branch online orders sell from: the one the owner picked, else the first. */
export async function storeBranch(b) {
  const picked = storeOf(b).branchId;
  if (picked) {
    const branch = await Branch.findOne({ _id: picked, businessId: b._id });
    if (branch) return branch;
  }
  return Branch.findOne({ businessId: b._id }).sort({ createdAt: 1 });
}

/** What a signed-in shopper needs to lay out and price the checkout. */
export function shopperConfig(b) {
  const s = storeOf(b);
  const settings = b.settings || {};
  return {
    acceptingOrders: s.acceptingOrders,
    currency: settings.currency || "₦",
    pickup: s.pickup,
    delivery: s.delivery,
    deliveryFee: s.deliveryFee,
    freeDeliveryOver: s.freeDeliveryOver,
    minOrder: s.minOrder,
    vat: settings.vatEnabled ? settings.vatRate : 0,
    payments: {
      cash_on_delivery: s.delivery && s.payOnDelivery,
      pay_at_pickup: s.pickup && s.payAtPickup,
      transfer: s.transfer && (s.pickup || s.delivery),
    },
    bank: s.transfer ? { bankName: s.bankName, accountName: s.accountName, accountNumber: s.accountNumber } : null,
    leadTime: s.leadTime,
    instructions: s.instructions,
    deliveryAreas: s.deliveryAreas,
    contact: { phone: siteOf(b).contact?.phone || "", whatsapp: siteOf(b).contact?.whatsapp || "" },
  };
}

/** The little the public sees BEFORE signing in: who this is, and that they must register. */
export function gateView(b) {
  const s = siteOf(b);
  return {
    storefront: true,
    name: businessLabel(b),
    logoUrl: s.logoUrl || "",
    heroUrl: s.heroUrl || "",
    accent: s.accent || "#3538f0",
    mode: s.mode || "light",
    template: s.template || "classic",
    headline: s.headline || "",
    tagline: s.tagline || "",
    announcement: s.announcement || "",
    acceptingOrders: storeOf(b).acceptingOrders,
  };
}


/** The filter for products this business offers online. Null = nothing is offered. */
function offeredFilter(b, branchId) {
  const s = siteOf(b);
  if (s.productMode === "none") return null;
  const filter = { businessId: b._id, status: "active", archetype: "stock" };
  if (s.productMode === "featured") {
    if (!s.featuredIds?.length) return null;
    filter._id = { $in: s.featuredIds };
  }
  return scopedToBranch({ branchId }, filter);
}

async function stockMap(branchId, productIds) {
  const rows = await Inventory.find({ branchId, productId: { $in: productIds } }).select("productId stock");
  return new Map(rows.map((r) => [String(r.productId), r.stock]));
}

const LOW = 5;

/** The shop window: name, price, photo and whether it can be bought — never cost or exact stock. */
export async function catalog(b, { q = "", category = "", page = 1, limit = 24 } = {}) {
  const branch = await storeBranch(b);
  const base = branch ? offeredFilter(b, branch._id) : null;
  if (!base) return { products: [], categories: [], total: 0, page: 1, pages: 1 };

  const categories = (await Product.distinct("category", base)).filter(Boolean).sort();
  const filter = { ...base };
  if (category) filter.category = String(category);
  if (q) {
    const rx = { $regex: escapeRegex(String(q).trim().slice(0, 60)), $options: "i" };
    filter.$and = [...(filter.$and || []), { $or: [{ name: rx }, { category: rx }] }];
  }

  limit = Math.min(Math.max(Number(limit) || 24, 1), 60);
  page = Math.max(Number(page) || 1, 1);
  const [rows, total] = await Promise.all([
    Product.find(filter).sort({ imageUrl: -1, name: 1 }).skip((page - 1) * limit).limit(limit).select("name category price imageUrl unit"),
    Product.countDocuments(filter),
  ]);
  const stock = await stockMap(branch._id, rows.map((p) => p._id));

  return {
    products: rows.map((p) => {
      const left = stock.get(String(p._id)) || 0;
      return {
        id: String(p._id), name: p.name, category: p.category || "", price: p.price, imageUrl: p.imageUrl || "", unit: p.unit || "",
        available: left > 0,
        // Only when it is nearly gone: a number to create honest urgency, not to leak the stock room.
        left: left > 0 && left <= LOW ? left : null,
      };
    }),
    categories,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/**
 * Prices a basket from the SERVER's own numbers and checks it against stock.
 * The browser's idea of a price is never trusted — it only says what it wants.
 * `problems` lists everything that stops this basket becoming an order.
 */
export async function priceBasket(b, rawItems, fulfilmentType) {
  const s = storeOf(b);
  const branch = await storeBranch(b);
  const problems = [];
  if (!branch) return { problems: [{ kind: "closed", message: "This store isn't set up to take orders yet." }] };

  const qtyBy = new Map();
  for (const it of rawItems) qtyBy.set(it.productId, (qtyBy.get(it.productId) || 0) + it.qty);

  const base = offeredFilter(b, branch._id);
  const ids = [...qtyBy.keys()].filter((id) => mongoose.isValidObjectId(id));
  const products = base && ids.length ? await Product.find({ $and: [base, { _id: { $in: ids } }] }) : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const stock = await stockMap(branch._id, products.map((p) => p._id));

  const lines = [];
  for (const [productId, qty] of qtyBy) {
    const p = byId.get(productId);
    if (!p) { problems.push({ kind: "unavailable", productId, message: "One of the items in your basket is no longer sold here." }); continue; }
    const have = stock.get(productId) || 0;
    if (qty > have) {
      problems.push({ kind: "stock", productId, name: p.name, available: Math.max(0, have), requested: qty, message: have > 0 ? `Only ${have} of ${p.name} left.` : `${p.name} is sold out.` });
      continue;
    }
    lines.push({ productId: p._id, name: p.name, qty, unitPrice: p.price, lineNet: money(p.price * qty), imageUrl: p.imageUrl || "" });
  }

  const subtotal = money(lines.reduce((t, l) => t + l.lineNet, 0));
  const settings = b.settings || {};
  const vat = settings.vatEnabled ? money((subtotal * settings.vatRate) / 100) : 0;
  let deliveryFee = 0;
  if (fulfilmentType === "delivery") {
    deliveryFee = s.freeDeliveryOver > 0 && subtotal >= s.freeDeliveryOver ? 0 : money(s.deliveryFee);
  }
  if (s.minOrder > 0 && subtotal < s.minOrder && !problems.length) {
    problems.push({ kind: "minimum", message: `The minimum order is ${settings.currency || "₦"}${s.minOrder.toLocaleString()}.` });
  }
  return { lines, subtotal, vat, deliveryFee, total: money(subtotal + vat + deliveryFee), problems, branchId: branch._id };
}

// ── what each side may see of an order ──────────────────────────────────────

const PAYMENT_LABEL = { cash_on_delivery: "Pay on delivery", pay_at_pickup: "Pay at pickup", transfer: "Bank transfer" };

export function shapeOrder(o, { forOwner = false, bank = null } = {}) {
  return {
    id: String(o._id),
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.createdAt,
    items: o.items.map((i) => ({ productId: String(i.productId), name: i.name, qty: i.qty, unitPrice: i.unitPrice, lineNet: i.lineNet, imageUrl: i.imageUrl || "" })),
    subtotal: o.subtotal,
    vat: o.vat,
    deliveryFee: o.deliveryFee,
    total: o.total,
    fulfilment: { type: o.fulfilment.type, address: o.fulfilment.address || "" },
    note: o.note || "",
    payment: { method: o.payment.method, label: PAYMENT_LABEL[o.payment.method], status: o.payment.status, paidAt: o.payment.paidAt || null },
    history: (o.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note || "" })),
    reason: o.reason || "",
    ...(bank && o.payment.method === "transfer" && o.payment.status === "unpaid" && ["placed", "confirmed", "ready", "out_for_delivery"].includes(o.status) ? { bank } : {}),
    ...(forOwner
      ? {
          customerId: String(o.customerId),
          contact: o.contact,
          saleId: o.saleId ? String(o.saleId) : null,
          saleNo: o.saleNo || null,
          history: (o.history || []).map((h) => ({ status: h.status, at: h.at, by: h.by || "", note: h.note || "" })),
        }
      : {}),
  };
}

// ── telling people ──────────────────────────────────────────────────────────

const money0 = (n, cur) => `${cur}${Math.round(n).toLocaleString()}`;

/** In-app alert for the owner's bell. One per order, closed when someone acts on it. */
export async function notifyNewOrder(b, order) {
  try {
    const cur = b.settings?.currency || "₦";
    await raise(
      { accountId: b.accountId, businessId: b._id, branchId: order.branchId },
      {
        type: "online_order",
        severity: "warning",
        title: `New online order ${order.orderNo} · ${money0(order.total, cur)}`,
        body: `${order.contact?.name || "A customer"} ordered ${order.items.length} item${order.items.length === 1 ? "" : "s"} for ${order.fulfilment.type}.`,
        target: { type: "order", id: order._id, label: order.orderNo },
        dedupeKey: `online_order:${order._id}`,
        data: { orderNo: order.orderNo, total: order.total },
      }
    );
  } catch (err) {
    console.error("order notification failed:", err.message);
  }
}
export const closeOrderNotice = (businessId, orderId) => resolve(businessId, `online_order:${orderId}`).catch(() => {});

async function ownerEmails(b) {
  const out = new Set();
  const contact = siteOf(b).contact?.email;
  if (contact) out.add(contact);
  const account = await Account.findById(b.accountId).select("ownerUserId");
  const owner = account && (await User.findById(account.ownerUserId).select("email"));
  if (owner?.email) out.add(owner.email);
  return [...out];
}

const itemsHtml = (o, cur) =>
  `<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:14px">${o.items
    .map((i) => `<div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f1f2f4;font-size:13px;color:#111827"><span>${esc(i.name)} × ${i.qty}</span><span>${esc(money0(i.lineNet, cur))}</span></div>`)
    .join("")}<div style="padding:10px 14px;font-size:14px;font-weight:700;color:#111827;display:flex;justify-content:space-between"><span>Total</span><span>${esc(money0(o.total, cur))}</span></div></div>`;

/** Best-effort: a mail provider having a bad day never blocks an order. */
export async function emailOwnerNewOrder(b, order) {
  try {
    const to = await ownerEmails(b);
    if (!to.length) return;
    const cur = b.settings?.currency || "₦";
    await sendMail({
      to,
      subject: `New online order ${order.orderNo} — ${money0(order.total, cur)}`,
      html: emailShell({
        businessName: businessLabel(b),
        heading: `New online order ${order.orderNo}`,
        intro: `${order.contact.name} (${order.contact.phone}) placed an order for ${order.fulfilment.type}. Open Online orders in your dashboard to confirm it.`,
        sections: [itemsHtml(order, cur), order.fulfilment.address ? `<p style="font-size:13px;color:#374151">Deliver to: ${esc(order.fulfilment.address)}</p>` : ""],
        footNote: "You are receiving this because someone ordered from your StarTrack page.",
      }),
    });
  } catch (err) {
    console.error("owner order email failed:", err.message);
  }
}

const STATUS_COPY = {
  placed: ["We've got your order", "Thanks! The shop will confirm it shortly."],
  confirmed: ["Your order is confirmed", "The shop accepted your order and is getting it ready."],
  ready: ["Your order is ready", "It's packed and ready for you."],
  out_for_delivery: ["Your order is on its way", "A rider is bringing it to you now."],
  completed: ["Order completed", "Thank you for shopping with us!"],
  rejected: ["We couldn't take your order", "The shop wasn't able to accept this order."],
  cancelled: ["Order cancelled", "This order has been cancelled."],
};

export async function emailCustomerStatus(b, order, extra = "") {
  try {
    const [heading, intro] = STATUS_COPY[order.status] || ["Order update", ""];
    const cur = b.settings?.currency || "₦";
    const bank = storeOf(b);
    const transferNote =
      order.status === "placed" && order.payment.method === "transfer" && bank.accountNumber
        ? `<p style="font-size:13px;color:#374151;margin:0 0 14px">Pay by transfer to <b>${esc(bank.bankName)}</b>, account <b>${esc(bank.accountNumber)}</b> (${esc(bank.accountName)}). Use <b>${esc(order.orderNo)}</b> as the reference.</p>`
        : "";
    await sendMail({
      to: order.contact.email,
      subject: `${heading} — ${order.orderNo}`,
      html: emailShell({
        businessName: businessLabel(b),
        heading: `${heading} · ${order.orderNo}`,
        intro: `${intro}${extra ? ` ${extra}` : ""}`,
        sections: [itemsHtml(order, cur), transferNote],
        footNote: `You are receiving this because you ordered from ${businessLabel(b)}.`,
      }),
    });
  } catch (err) {
    console.error("customer order email failed:", err.message);
  }
}
