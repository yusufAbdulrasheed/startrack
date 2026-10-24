import { Business } from "#modules/business/business.model.js";
import { Product } from "#modules/products/product.model.js";
import { typeTemplate } from "#shared/businessTypes.js";

/**
 * A business's public page. The owner edits it (site.routes.js); anyone with
 * the link reads it (site.public.routes.js). Everything the public sees is
 * shaped HERE, in one place, so the rule "never expose cost, stock, customers
 * or internal ids" lives next to the one function that builds the payload.
 */

// Words that would collide with app routes or look official.
const RESERVED = new Set(["app", "api", "admin", "login", "register", "s", "static", "assets", "loyalty", "startrack", "support", "help", "www", "platform"]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

export const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

export const slugProblem = (slug) => {
  if (!SLUG_RE.test(slug)) return "Use 3–40 letters, numbers or hyphens.";
  if (RESERVED.has(slug)) return "That address is reserved. Try another.";
  if (/--/.test(slug)) return "Avoid double hyphens.";
  return "";
};

/** A free address near what the business is called. */
export async function suggestSlug(name, ownBusinessId) {
  let base = slugify(name);
  if (base.length < 3) base = `${base}-shop`.replace(/^-/, "").padEnd(3, "x");
  if (RESERVED.has(base)) base = `${base}-store`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 36)}-${i + 1}`;
    const taken = await Business.findOne({ "site.slug": candidate, _id: { $ne: ownBusinessId } }).select("_id");
    if (!taken) return candidate;
  }
  return `${base.slice(0, 30)}-${Date.now().toString(36)}`;
}

/** The business's site settings as a plain object (nested mongoose paths aren't one). */
export const siteOf = (b) => (b?.toObject ? b.toObject().site : b?.site) || {};

export const SECTION_KEYS = ["about", "stats", "features", "products", "gallery", "testimonials", "faq", "cta", "visit"];
export const DEFAULT_ORDER = ["stats", "about", "features", "products", "gallery", "testimonials", "faq", "cta", "visit"];
export const ICONS = ["sparkles", "truck", "shield", "clock", "heart", "star", "leaf", "award", "users", "phone", "map-pin", "badge-check"];

/** Saved order, with any section it doesn't know about added back in its default place. */
const orderOf = (saved) => {
  const known = (saved || []).filter((k) => SECTION_KEYS.includes(k));
  const seen = new Set(known);
  return [...known, ...DEFAULT_ORDER.filter((k) => !seen.has(k))];
};

const DEFAULT_HOURS = Array.from({ length: 7 }, (_, day) => ({ day, open: "09:00", close: "18:00", closed: day === 0 }));

/** What the editor shows: saved values over sensible starting points. */
export async function ownerView(b) {
  const s = siteOf(b);
  const t = typeTemplate(b.typeKey);
  return {
    enabled: !!s.enabled,
    slug: s.slug || (await suggestSlug(b.tradingName || b.name, b._id)),
    slugSaved: !!s.slug,
    template: s.template || "classic",
    mode: s.mode || "light",
    accent: s.accent || "#3538f0",
    headline: s.headline || "",
    tagline: s.tagline || "",
    about: s.about || "",
    logoUrl: s.logoUrl || "",
    heroUrl: s.heroUrl || "",
    contact: { phone: "", whatsapp: "", email: "", address: "", mapUrl: "", ...(s.contact || {}) },
    social: { instagram: "", facebook: "", tiktok: "", website: "", ...(s.social || {}) },
    hours: s.hours?.length === 7 ? s.hours.map((h) => ({ day: h.day, open: h.open, close: h.close, closed: !!h.closed })) : DEFAULT_HOURS,
    show: { about: true, products: true, hours: true, contact: true, stats: true, features: true, gallery: true, testimonials: true, faq: true, cta: true, ...(s.show || {}) },
    announcement: s.announcement || "",
    aboutImageUrl: s.aboutImageUrl || "",
    stats: (s.stats || []).map((x) => ({ value: x.value || "", label: x.label || "" })),
    features: (s.features || []).map((x) => ({ icon: x.icon || "sparkles", title: x.title || "", text: x.text || "" })),
    gallery: (s.gallery || []).map((x) => ({ url: x.url, id: x.publicId || "" })),
    testimonials: (s.testimonials || []).map((x) => ({ name: x.name || "", role: x.role || "", quote: x.quote || "", rating: x.rating || 5 })),
    faqs: (s.faqs || []).map((x) => ({ q: x.q || "", a: x.a || "" })),
    cta: { headline: "", text: "", label: "", action: "whatsapp", ...(s.cta || {}) },
    order: orderOf(s.order),
    productMode: s.productMode || "all",
    featuredIds: (s.featuredIds || []).map(String),
    name: b.tradingName || b.name,
    typeLabel: t.label,
    currency: b.settings?.currency || "₦",
  };
}

const PRODUCT_CAP = 60;

/** Items the public may see: name, price, category, photo — nothing about cost or stock. */
export async function publicProducts(b) {
  const s = siteOf(b);
  if (!s.show?.products || s.productMode === "none") return [];
  const filter = { businessId: b._id, status: "active" };
  if (s.productMode === "featured") {
    if (!s.featuredIds?.length) return [];
    filter._id = { $in: s.featuredIds };
  }
  const rows = await Product.find(filter).sort({ imageUrl: -1, createdAt: -1 }).limit(PRODUCT_CAP).select("name category price imageUrl");
  let list = rows.map((p) => ({ name: p.name, category: p.category || "", price: p.price, imageUrl: p.imageUrl || "" }));
  // Products with a photo first reads best; with featured, keep the owner's own order.
  if (s.productMode === "featured") {
    const order = new Map(s.featuredIds.map((id, i) => [String(id), i]));
    const byId = new Map(rows.map((p) => [String(p._id), p]));
    list = [...byId.entries()].sort((a, c) => (order.get(a[0]) ?? 0) - (order.get(c[0]) ?? 0)).map(([, p]) => ({ name: p.name, category: p.category || "", price: p.price, imageUrl: p.imageUrl || "" }));
  }
  return list;
}

export async function publicView(b) {
  const s = siteOf(b);
  const o = await ownerView(b);
  return {
    name: o.name,
    typeLabel: o.typeLabel,
    currency: o.currency,
    template: o.template,
    mode: o.mode,
    accent: o.accent,
    headline: o.headline,
    tagline: o.tagline,
    about: s.show?.about === false ? "" : o.about,
    logoUrl: o.logoUrl,
    heroUrl: o.heroUrl,
    contact: o.show.contact ? o.contact : { phone: "", whatsapp: "", email: "", address: "", mapUrl: "" },
    social: o.social,
    hours: o.show.hours ? o.hours : [],
    show: o.show,
    announcement: o.announcement,
    aboutImageUrl: o.aboutImageUrl,
    stats: o.show.stats ? o.stats.filter((x) => x.value && x.label) : [],
    features: o.show.features ? o.features.filter((x) => x.title) : [],
    gallery: o.show.gallery ? o.gallery.map((g) => g.url) : [],
    testimonials: o.show.testimonials ? o.testimonials.filter((x) => x.quote && x.name) : [],
    faqs: o.show.faq ? o.faqs.filter((x) => x.q && x.a) : [],
    cta: o.show.cta && o.cta.headline ? o.cta : null,
    order: o.order,
    products: await publicProducts(b),
  };
}
