import { toIntlPhone } from "@/lib/phone";
import { Award, BadgeCheck, Clock, Heart, Leaf, MapPin, Phone, ShieldCheck, Sparkles, Star, Truck, Users, type LucideIcon } from "lucide-react";

/** Shared by the public business page and the owner's editor that previews it. */

export type SiteHours = { day: number; open: string; close: string; closed: boolean };
export type SiteStat = { value: string; label: string };
export type SiteFeature = { icon: string; title: string; text: string };
export type SiteTestimonial = { name: string; role: string; quote: string; rating: number };
export type SiteFaq = { q: string; a: string };
export type SiteCta = { headline: string; text: string; label: string; action: "whatsapp" | "call" | "email" | "directions" };
export type SectionKey = "about" | "stats" | "features" | "products" | "gallery" | "testimonials" | "faq" | "cta" | "visit";

export const FEATURE_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, truck: Truck, shield: ShieldCheck, clock: Clock, heart: Heart, star: Star,
  leaf: Leaf, award: Award, users: Users, phone: Phone, "map-pin": MapPin, "badge-check": BadgeCheck,
};

/** What the owner can order and switch, in the editor's words. */
export const SECTIONS: { key: SectionKey; label: string; blurb: string }[] = [
  { key: "stats", label: "Numbers", blurb: "A strip of headline figures" },
  { key: "about", label: "About us", blurb: "Your story, with a photo" },
  { key: "features", label: "Why choose us", blurb: "Up to 6 reasons, with icons" },
  { key: "products", label: "What we offer", blurb: "Products and prices" },
  { key: "gallery", label: "Gallery", blurb: "A grid of your photos" },
  { key: "testimonials", label: "Reviews", blurb: "What customers say" },
  { key: "faq", label: "FAQ", blurb: "Common questions answered" },
  { key: "cta", label: "Call to action", blurb: "A final nudge to get in touch" },
  { key: "visit", label: "Visit us", blurb: "Hours, address and map" },
];

export type SiteProduct = { name: string; category: string; price: number; imageUrl: string };

// What the public page renders. The editor builds the same shape from its draft.
export type SiteData = {
  name: string;
  typeLabel: string;
  currency: string;
  template: "classic" | "bold" | "minimal";
  mode: "light" | "dark";
  accent: string;
  headline: string;
  tagline: string;
  about: string;
  logoUrl: string;
  heroUrl: string;
  contact: { phone: string; whatsapp: string; email: string; address: string; mapUrl: string };
  social: { instagram: string; facebook: string; tiktok: string; website: string };
  hours: SiteHours[];
  show: { about: boolean; products: boolean; hours: boolean; contact: boolean; stats: boolean; features: boolean; gallery: boolean; testimonials: boolean; faq: boolean; cta: boolean };
  products: SiteProduct[];
  announcement: string;
  aboutImageUrl: string;
  stats: SiteStat[];
  features: SiteFeature[];
  gallery: string[];
  testimonials: SiteTestimonial[];
  faqs: SiteFaq[];
  cta: SiteCta | null;
  order: SectionKey[];
};

export const ACCENTS = [
  { name: "Royal", hex: "#3538f0" },
  { name: "Emerald", hex: "#0f9f6e" },
  { name: "Ember", hex: "#c2410c" },
  { name: "Rose", hex: "#d02b6a" },
  { name: "Ocean", hex: "#0e7fb3" },
  { name: "Gold", hex: "#b7791f" },
  { name: "Plum", hex: "#7c3aed" },
  { name: "Ink", hex: "#1f2937" },
];

export const TEMPLATES: { key: SiteData["template"]; label: string; blurb: string }[] = [
  { key: "classic", label: "Classic", blurb: "Colour hero, rounded cards" },
  { key: "bold", label: "Bold", blurb: "Big type, full-colour bands" },
  { key: "minimal", label: "Minimal", blurb: "Clean, lots of white space" },
];

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday first reads more naturally for a shop's hours.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Black or white, whichever is readable on this colour. */
export function onColor(hex: string): "#ffffff" | "#111827" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.42 ? "#111827" : "#ffffff";
}

export const telHref = (raw: string) => (raw ? `tel:${raw.replace(/[^\d+]/g, "")}` : "");

const handle = (v: string) => v.trim().replace(/^@/, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/[^\w.\-/]/g, "");

/** Turns what an owner typed ("@mamacass", a full link) into a safe https link. */
export function socialLinks(s: SiteData["social"]): { key: string; label: string; href: string }[] {
  const out: { key: string; label: string; href: string }[] = [];
  const asUrl = (v: string) => (/^https?:\/\//i.test(v.trim()) ? v.trim() : "");
  if (s.instagram.trim()) out.push({ key: "instagram", label: "Instagram", href: asUrl(s.instagram) || `https://instagram.com/${handle(s.instagram)}` });
  if (s.facebook.trim()) out.push({ key: "facebook", label: "Facebook", href: asUrl(s.facebook) || `https://facebook.com/${handle(s.facebook)}` });
  if (s.tiktok.trim()) out.push({ key: "tiktok", label: "TikTok", href: asUrl(s.tiktok) || `https://tiktok.com/@${handle(s.tiktok)}` });
  if (s.website.trim() && /^https?:\/\//i.test(s.website)) out.push({ key: "website", label: "Website", href: s.website.trim() });
  return out;
}

const fmt12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${ap}`;
};
export const hoursLabel = (h: SiteHours) => (h.closed ? "Closed" : `${fmt12(h.open)} – ${fmt12(h.close)}`);

/** "Open now · closes 6pm" / "Closed · opens Mon 9am" from the visitor's own clock. */
export function openStatus(hours: SiteHours[], now = new Date()): { open: boolean; text: string } | null {
  if (hours.length !== 7) return null;
  const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const today = hours.find((h) => h.day === now.getDay());
  const cur = now.getHours() * 60 + now.getMinutes();
  if (today && !today.closed && cur >= mins(today.open) && cur < mins(today.close)) return { open: true, text: `Open now · closes ${fmt12(today.close)}` };
  if (today && !today.closed && cur < mins(today.open)) return { open: false, text: `Closed · opens ${fmt12(today.open)}` };
  for (let i = 1; i <= 7; i++) {
    const d = hours.find((h) => h.day === (now.getDay() + i) % 7);
    if (d && !d.closed) return { open: false, text: `Closed · opens ${i === 1 ? "tomorrow" : DAYS[d.day].slice(0, 3)} ${fmt12(d.open)}` };
  }
  return { open: false, text: "Closed" };
}

/** Where a call-to-action button points. */
export function ctaHref(action: SiteCta["action"], c: SiteData["contact"]): string {
  if (action === "whatsapp") return toIntlPhone(c.whatsapp || c.phone) ? `https://wa.me/${toIntlPhone(c.whatsapp || c.phone)}` : "";
  if (action === "call") return telHref(c.phone || c.whatsapp);
  if (action === "email") return c.email ? `mailto:${c.email}` : "";
  return c.mapUrl || (c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : "");
}
