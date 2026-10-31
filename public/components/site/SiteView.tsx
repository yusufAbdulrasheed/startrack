import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Clock, Mail, MapPin, MessageCircle, Navigation, Phone, Quote, Star, X } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { toIntlPhone } from "@/lib/phone";
import {
  DAYS, DAY_ORDER, FEATURE_ICONS, ctaHref, hoursLabel, onColor, openStatus, socialLinks, telHref,
  type SectionKey, type SiteData, type SiteProduct,
} from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * A business's public page. Pure rendering: the live page and the owner's
 * editor preview both feed it a SiteData, so what the owner sees while
 * editing is exactly what visitors get. Layout responds to ITS OWN width
 * (container queries), not the window's, so the narrow preview pane behaves
 * like a phone and the full page like a desktop.
 */

type Theme = { bg: string; band: string; surface: string; text: string; muted: string; line: string; soft: string; accent: string; onAccent: string; dark: boolean };

function themeFor(d: SiteData): Theme {
  const dark = d.mode === "dark";
  const onAccent = onColor(d.accent);
  const base = dark ? "#0b0e1f" : "#ffffff";
  return {
    dark,
    bg: dark ? "#0b0e1f" : d.template === "minimal" ? "#ffffff" : "#f7f8fc",
    band: dark ? "#0f1330" : d.template === "minimal" ? "#ffffff" : "#ffffff",
    surface: dark ? "#151a3a" : "#ffffff",
    text: dark ? "#f4f5ff" : "#0f1330",
    muted: dark ? "#a7accb" : "#5d6384",
    line: dark ? "rgba(255,255,255,0.1)" : "#e6e8f4",
    soft: `color-mix(in srgb, ${d.accent} ${dark ? 18 : 9}%, ${base})`,
    accent: d.accent,
    onAccent,
  };
}

const LABELS: Partial<Record<SectionKey, string>> = { about: "About", features: "Why us", products: "Offer", gallery: "Gallery", testimonials: "Reviews", faq: "FAQ", visit: "Visit" };

function Tile({ p, t, size = "md" }: { p: SiteProduct; t: Theme; size?: "sm" | "md" }) {
  if (p.imageUrl) return <img src={p.imageUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />;
  return (
    <div className="w-full h-full grid place-items-center font-bold" style={{ background: `linear-gradient(135deg, ${t.soft}, color-mix(in srgb, ${t.accent} 22%, ${t.dark ? "#0b0e1f" : "#fff"}))`, color: t.accent, fontSize: size === "sm" ? 18 : 36 }}>
      {p.name.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

function Btn({ href, children, t, kind = "solid", preview, className }: { href?: string; children: React.ReactNode; t: Theme; kind?: "solid" | "ghost" | "light" | "dark"; preview?: boolean; className?: string }) {
  const style =
    kind === "solid" ? { background: t.accent, color: t.onAccent, boxShadow: `0 12px 24px -12px ${t.accent}` }
    : kind === "light" ? { background: "#ffffff", color: "#111827", boxShadow: "0 12px 24px -14px rgba(0,0,0,0.4)" }
    : kind === "dark" ? { background: "#111827", color: "#fff" }
    : { background: "transparent", color: "inherit", boxShadow: "inset 0 0 0 1.5px currentColor" };
  const cls = cn("inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[14.5px] font-bold whitespace-nowrap transition-transform hover:-translate-y-0.5", className);
  if (!href || preview) return <span className={cls} style={style}>{children}</span>;
  return <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={cls} style={style}>{children}</a>;
}

function Heading({ eyebrow, title, sub, t, center }: { eyebrow: string; title: string; sub?: string; t: Theme; center?: boolean }) {
  return (
    <div className={cn("mb-9 @3xl:mb-12 max-w-[640px]", center && "mx-auto text-center")}>
      <div className="inline-flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ color: t.accent }}>
        <i className="w-6 h-[2px] rounded-full" style={{ background: t.accent }} /> {eyebrow}
      </div>
      <h2 className="mt-3 text-[28px] @3xl:text-[40px] font-extrabold tracking-[-0.025em] leading-[1.1]">{title}</h2>
      {sub && <p className="mt-3 text-[16px] leading-relaxed" style={{ color: t.muted }}>{sub}</p>}
    </div>
  );
}

export function SiteView({ data: d, preview = false, storeHeader, shopLink = false }: {
  data: SiteData;
  preview?: boolean;
  /** An online store supplies its own header (basket, account) in place of the page's. */
  storeHeader?: React.ReactNode;
  /** Point the hero's second button at the shop instead of the product list. */
  shopLink?: boolean;
}) {
  const t = themeFor(d);
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<number | null>(0);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const status = useMemo(() => (d.show.hours ? openStatus(d.hours) : null), [d.hours, d.show.hours]);
  const cats = useMemo(() => ["All", ...Array.from(new Set(d.products.map((p) => p.category).filter(Boolean)))], [d.products]);
  const shown = cat === "All" || !cats.includes(cat) ? d.products : d.products.filter((p) => p.category === cat);
  const wa = toIntlPhone(d.contact.whatsapp);
  const call = telHref(d.contact.phone);
  const directions = ctaHref("directions", d.contact);
  const socials = socialLinks(d.social);
  const bold = d.template === "bold";
  const minimal = d.template === "minimal";
  const headline = d.headline || d.name;
  const heroInk = minimal ? t.text : t.onAccent;
  const primary = wa ? { href: `https://wa.me/${wa}`, label: "Chat on WhatsApp", icon: MessageCircle } : call ? { href: call, label: "Call us", icon: Phone } : null;
  const today = new Date().getDay();
  const hasContact = d.show.contact && !!(d.contact.phone || d.contact.whatsapp || d.contact.email || d.contact.address || socials.length);
  const hasHours = d.show.hours && d.hours.length === 7;

  const have: Record<SectionKey, boolean> = {
    stats: d.show.stats && d.stats.length > 0,
    about: d.show.about && !!(d.about || d.aboutImageUrl),
    features: d.show.features && d.features.length > 0,
    products: d.show.products && d.products.length > 0,
    gallery: d.show.gallery && d.gallery.length > 0,
    testimonials: d.show.testimonials && d.testimonials.length > 0,
    faq: d.show.faq && d.faqs.length > 0,
    cta: d.show.cta && !!d.cta,
    visit: hasHours || hasContact,
  };
  const order = d.order.filter((k) => have[k]);
  const navLinks = order.filter((k) => LABELS[k]);
  const go = (k: string) => (preview ? undefined : `#sec-${k}`);
  const secondary = shopLink ? { href: "#shop", label: "Start shopping" } : have.products ? { href: go("products"), label: "See what we offer" } : directions ? { href: directions, label: "Get directions" } : null;
  const popular = d.products.slice(0, 3);
  const band = minimal ? undefined : t.band;

  // The middle sections, each rendered by key so the owner's order is honoured.
  const render: Record<SectionKey, () => React.ReactNode> = {
    stats: () => (
      <div className={cn("grid gap-px overflow-hidden", d.stats.length >= 4 ? "grid-cols-2 @3xl:grid-cols-4" : d.stats.length === 3 ? "grid-cols-3" : d.stats.length === 2 ? "grid-cols-2" : "grid-cols-1")}
        style={{ background: t.line, borderRadius: 24, boxShadow: "0 24px 48px -28px rgba(15,19,48,0.45)", border: `1px solid ${t.line}` }}>
        {d.stats.map((s, i) => (
          <div key={i} className="px-5 py-6 @3xl:py-8 text-center" style={{ background: t.surface }}>
            <div className="text-[28px] @3xl:text-[40px] font-extrabold tracking-[-0.03em] leading-none" style={{ color: t.accent }}>{s.value}</div>
            <div className="mt-2 text-[13px] @3xl:text-[14px] font-semibold" style={{ color: t.muted }}>{s.label}</div>
          </div>
        ))}
      </div>
    ),

    about: () => (
      <div className={cn("grid gap-10 @3xl:gap-16 items-center", d.aboutImageUrl && "@3xl:grid-cols-2")}>
        {d.aboutImageUrl && (
          <div className="relative">
            <div className="absolute -left-3 -bottom-3 @3xl:-left-5 @3xl:-bottom-5 w-2/3 h-2/3 rounded-[28px]" style={{ background: t.soft, border: `1px solid ${t.line}` }} />
            <img src={d.aboutImageUrl} alt={`About ${d.name}`} loading="lazy" referrerPolicy="no-referrer" className="relative w-full aspect-[4/5] @3xl:aspect-[5/6] object-cover rounded-[28px]" style={{ boxShadow: "0 30px 60px -30px rgba(15,19,48,0.5)" }} />
          </div>
        )}
        <div>
          <Heading eyebrow="About us" title={`Meet ${d.name}`} t={t} />
          <p className="text-[17px] @3xl:text-[18.5px] leading-[1.8] whitespace-pre-line -mt-3" style={{ color: t.muted }}>{d.about}</p>
          {primary && <div className="mt-7"><Btn href={primary.href} t={t} preview={preview}><primary.icon className="w-4 h-4" /> {primary.label}</Btn></div>}
        </div>
      </div>
    ),

    features: () => (
      <>
        <Heading eyebrow="Why choose us" title={`What makes ${d.name} different`} t={t} center />
        <div className={cn("grid gap-5", d.features.length === 1 ? "max-w-[420px] mx-auto" : d.features.length === 2 ? "@2xl:grid-cols-2 max-w-[760px] mx-auto" : "@2xl:grid-cols-2 @4xl:grid-cols-3")}>
          {d.features.map((f, i) => {
            const Icon = FEATURE_ICONS[f.icon] || FEATURE_ICONS.sparkles;
            return (
              <div key={i} className="p-6 @3xl:p-7 transition-transform hover:-translate-y-1" style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: bold ? 24 : 22, boxShadow: "0 20px 40px -32px rgba(15,19,48,0.5)" }}>
                <span className="grid place-items-center w-12 h-12 rounded-2xl" style={bold ? { background: t.accent, color: t.onAccent } : { background: t.soft, color: t.accent }}><Icon className="w-6 h-6" strokeWidth={1.8} /></span>
                <h3 className="mt-5 text-[18px] font-extrabold tracking-[-0.01em]">{f.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed" style={{ color: t.muted }}>{f.text}</p>
              </div>
            );
          })}
        </div>
      </>
    ),

    products: () => (
      <>
        <div className="flex items-end justify-between gap-5 flex-wrap">
          <Heading eyebrow="What we offer" title={bold ? "Fresh from us" : "Our selection"} sub={`${d.products.length} item${d.products.length === 1 ? "" : "s"} from ${d.name}`} t={t} />
          {cats.length > 2 && (
            <div className="flex gap-2 flex-wrap mb-9 @3xl:mb-12">
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} className="h-10 px-5 rounded-full text-[13.5px] font-semibold transition-colors"
                  style={cat === c ? { background: t.accent, color: t.onAccent } : { background: t.surface, color: t.muted, boxShadow: `inset 0 0 0 1px ${t.line}` }}>{c}</button>
              ))}
            </div>
          )}
        </div>
        {minimal ? (
          <ul className="grid @2xl:grid-cols-2 gap-x-12">
            {shown.map((p, i) => (
              <li key={i} className="flex items-center gap-4 py-4" style={{ borderBottom: `1px solid ${t.line}` }}>
                <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0"><Tile p={p} t={t} size="sm" /></div>
                <div className="min-w-0 flex-1"><div className="font-bold text-[15.5px] truncate">{p.name}</div>{p.category && <div className="text-[13px]" style={{ color: t.muted }}>{p.category}</div>}</div>
                <div className="font-extrabold text-[16px] tabular-nums" style={{ color: t.accent }}>{fmtMoney(p.price, d.currency)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-2 @2xl:grid-cols-3 @4xl:grid-cols-4 gap-4 @3xl:gap-6">
            {shown.map((p, i) => (
              <article key={i} className="group overflow-hidden transition-all hover:-translate-y-1" style={{ background: t.surface, borderRadius: bold ? 24 : 20, border: `1px solid ${t.line}`, boxShadow: "0 20px 40px -32px rgba(15,19,48,0.55)" }}>
                <div className="aspect-[4/3] relative overflow-hidden">
                  <div className="w-full h-full transition-transform duration-500 group-hover:scale-105"><Tile p={p} t={t} /></div>
                  <span className="absolute left-3 bottom-3 px-3 py-1.5 rounded-full text-[13px] font-extrabold tabular-nums" style={{ background: t.accent, color: t.onAccent, boxShadow: "0 8px 16px -8px rgba(0,0,0,0.5)" }}>{fmtMoney(p.price, d.currency)}</span>
                </div>
                <div className="p-4 @3xl:p-5">
                  <div className="font-bold text-[15px] leading-snug line-clamp-2">{p.name}</div>
                  {p.category && <div className="mt-1 text-[12.5px]" style={{ color: t.muted }}>{p.category}</div>}
                </div>
              </article>
            ))}
          </div>
        )}
      </>
    ),

    gallery: () => (
      <>
        <Heading eyebrow="Gallery" title="A look inside" t={t} center />
        <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3 @3xl:gap-4 auto-rows-[140px] @3xl:auto-rows-[200px]">
          {d.gallery.map((u, i) => (
            <button key={i} type="button" onClick={() => !preview && setLightbox(u)} className={cn("relative overflow-hidden group", i === 0 && d.gallery.length === 5 && "col-span-2 row-span-2")} style={{ borderRadius: 22 }}>
              <img src={u} alt={`${d.name} photo ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            </button>
          ))}
        </div>
      </>
    ),

    testimonials: () => (
      <>
        <Heading eyebrow="Reviews" title="Loved by our customers" t={t} center />
        <div className={cn("grid gap-5", d.testimonials.length === 1 ? "max-w-[620px] mx-auto" : "@2xl:grid-cols-2 @4xl:grid-cols-3")}>
          {d.testimonials.map((r, i) => (
            <figure key={i} className="p-6 @3xl:p-7 flex flex-col" style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 24, boxShadow: "0 20px 40px -32px rgba(15,19,48,0.5)" }}>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">{Array.from({ length: 5 }, (_, n) => <Star key={n} className="w-4 h-4" style={{ color: "#f5a524" }} fill={n < r.rating ? "#f5a524" : "none"} strokeWidth={1.6} />)}</div>
                <Quote className="w-7 h-7" style={{ color: t.soft }} fill={t.soft} />
              </div>
              <blockquote className="mt-4 text-[15.5px] leading-[1.7] flex-1">{r.quote}</blockquote>
              <figcaption className="mt-5 pt-5 flex items-center gap-3" style={{ borderTop: `1px solid ${t.line}` }}>
                <span className="grid place-items-center w-10 h-10 rounded-full font-bold text-[15px]" style={{ background: t.accent, color: t.onAccent }}>{r.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0"><div className="font-bold text-[14.5px] truncate">{r.name}</div>{r.role && <div className="text-[12.5px] truncate" style={{ color: t.muted }}>{r.role}</div>}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </>
    ),

    faq: () => (
      <div className="grid @4xl:grid-cols-[1fr_1.5fr] gap-8 @4xl:gap-16">
        <Heading eyebrow="FAQ" title="Questions, answered" sub="Can't find what you need? Just message us." t={t} />
        <div className="space-y-3">
          {d.faqs.map((f, i) => {
            const on = open === i;
            return (
              <div key={i} style={{ background: t.surface, border: `1px solid ${on ? t.accent : t.line}`, borderRadius: 18, transition: "border-color .2s" }}>
                <button type="button" onClick={() => setOpen(on ? null : i)} aria-expanded={on} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="font-bold text-[15.5px]">{f.q}</span>
                  <ChevronDown className={cn("w-5 h-5 shrink-0 transition-transform", on && "rotate-180")} style={{ color: t.accent }} />
                </button>
                {on && <p className="px-5 pb-5 -mt-1 text-[15px] leading-[1.7] whitespace-pre-line" style={{ color: t.muted }}>{f.a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    ),

    cta: () => {
      const c = d.cta!;
      const href = ctaHref(c.action, d.contact) || primary?.href;
      return (
        <div className="relative overflow-hidden text-center px-6 py-14 @3xl:py-20" style={{ borderRadius: 32, background: minimal ? "#111827" : `linear-gradient(120deg, ${t.accent}, color-mix(in srgb, ${t.accent} 55%, #7b3cf5))`, color: minimal ? "#fff" : t.onAccent }}>
          <div className="absolute -left-16 -bottom-24 w-72 h-72 rounded-full bg-white/10" />
          <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-white/10" />
          <div className="relative max-w-[640px] mx-auto">
            <h2 className="text-[30px] @3xl:text-[46px] font-extrabold tracking-[-0.03em] leading-[1.08]">{c.headline}</h2>
            {c.text && <p className="mt-4 text-[17px] leading-relaxed opacity-90">{c.text}</p>}
            <div className="mt-8 flex justify-center"><Btn href={href} t={t} kind="light" preview={preview}>{c.label || "Get in touch"} <ArrowRight className="w-4 h-4" /></Btn></div>
          </div>
        </div>
      );
    },

    visit: () => (
      <>
        <Heading eyebrow="Visit us" title="Come see us" sub={d.contact.address || undefined} t={t} center />
        <div className="grid @3xl:grid-cols-2 gap-5">
          {hasHours && (
            <div className="p-6 @3xl:p-7" style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 26 }}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5"><Clock className="w-5 h-5" style={{ color: t.accent }} /><h3 className="font-extrabold text-[18px]">Opening hours</h3></div>
                {status && <span className="text-[12px] font-bold px-2.5 py-1 rounded-full" style={{ background: status.open ? "rgba(16,185,129,0.14)" : "rgba(244,63,94,0.12)", color: status.open ? "#10b981" : "#f43f5e" }}>{status.open ? "Open now" : "Closed"}</span>}
              </div>
              <ul className="space-y-1">
                {DAY_ORDER.map((day) => {
                  const h = d.hours.find((x) => x.day === day);
                  if (!h) return null;
                  const isToday = day === today;
                  return (
                    <li key={day} className="flex justify-between gap-4 px-3.5 py-2.5 rounded-xl text-[14.5px]" style={isToday ? { background: t.soft, fontWeight: 700 } : { color: t.muted }}>
                      <span style={isToday ? { color: t.text } : undefined}>{DAYS[day]}</span>
                      <span style={{ color: t.text }}>{hoursLabel(h)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {hasContact && (
            <div className="p-6 @3xl:p-7 flex flex-col" style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 26 }}>
              <div className="flex items-center gap-2.5 mb-4"><MapPin className="w-5 h-5" style={{ color: t.accent }} /><h3 className="font-extrabold text-[18px]">Get in touch</h3></div>
              <ul className="space-y-3.5 text-[15px]">
                {d.contact.address && <li className="flex gap-3"><MapPin className="w-4 h-4 mt-1 shrink-0" style={{ color: t.muted }} /><span>{d.contact.address}</span></li>}
                {d.contact.phone && <li className="flex gap-3"><Phone className="w-4 h-4 mt-1 shrink-0" style={{ color: t.muted }} /><a href={preview ? undefined : call} className="hover:underline">{d.contact.phone}</a></li>}
                {d.contact.email && <li className="flex gap-3"><Mail className="w-4 h-4 mt-1 shrink-0" style={{ color: t.muted }} /><a href={preview ? undefined : `mailto:${d.contact.email}`} className="hover:underline break-all">{d.contact.email}</a></li>}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                {directions && <Btn href={directions} t={t} preview={preview}><Navigation className="w-4 h-4" /> Directions</Btn>}
                {wa && <Btn href={`https://wa.me/${wa}`} t={t} kind="ghost" preview={preview}><MessageCircle className="w-4 h-4" /> WhatsApp</Btn>}
              </div>
            </div>
          )}
        </div>
        {!preview && d.contact.address && (
          <div className="mt-5 overflow-hidden" style={{ borderRadius: 26, border: `1px solid ${t.line}` }}>
            <iframe title={`Map to ${d.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="w-full h-[320px] block" style={{ border: 0, filter: t.dark ? "invert(0.9) hue-rotate(180deg)" : undefined }} src={`https://maps.google.com/maps?q=${encodeURIComponent(d.contact.address)}&output=embed`} />
          </div>
        )}
      </>
    ),
  };

  return (
    <div className="@container w-full" style={{ background: t.bg, color: t.text, fontFamily: "var(--st-font-sans, inherit)", scrollBehavior: "smooth" }}>
      {d.announcement && (
        <div className="px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: t.dark ? "#1b2150" : "#111827", color: "#fff" }}>{d.announcement}</div>
      )}

      {/* Navigation */}
      {storeHeader ?? (
      <header className="sticky top-0 z-30" style={{ background: t.dark ? "rgba(11,14,31,0.82)" : "rgba(255,255,255,0.86)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${t.line}` }}>
        <div className="flex items-center gap-3 px-5 @3xl:px-10 h-[68px] max-w-[1240px] mx-auto">
          {d.logoUrl
            ? <img src={d.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" />
            : <span className="w-10 h-10 rounded-xl grid place-items-center font-extrabold text-[16px]" style={{ background: t.accent, color: t.onAccent }}>{d.name.slice(0, 1).toUpperCase()}</span>}
          <span className="font-extrabold text-[17px] tracking-[-0.01em] truncate">{d.name}</span>
          <nav className="hidden @4xl:flex items-center gap-1 ml-8">
            {navLinks.map((k) => <a key={k} href={go(k)} className="px-3.5 py-2 rounded-full text-[14px] font-semibold transition-colors hover:opacity-100" style={{ color: t.muted }}>{LABELS[k]}</a>)}
          </nav>
          <span className="ml-auto" />
          {primary && <Btn href={primary.href} t={t} preview={preview} className="!h-10 !px-5 !text-[13.5px]"><primary.icon className="w-4 h-4" /><span className="hidden @md:inline">{primary.label}</span><span className="@md:hidden">Contact</span></Btn>}
        </div>
      </header>
      )}

      {/* Hero */}
      <section className={cn("relative px-4 @3xl:px-8", minimal ? "pt-10 @3xl:pt-16" : "pt-4 @3xl:pt-6")}>
        <div
          className={cn("relative overflow-hidden max-w-[1240px] mx-auto", minimal ? "px-1" : "px-6 @3xl:px-14 py-14 @3xl:py-24", !minimal && (bold ? "rounded-[28px]" : "rounded-[36px]"))}
          style={minimal ? undefined : { background: bold ? t.accent : d.heroUrl && !bold ? `linear-gradient(180deg, rgba(8,10,30,0.4), rgba(8,10,30,0.8)), url(${d.heroUrl}) center/cover` : `linear-gradient(125deg, ${t.accent}, color-mix(in srgb, ${t.accent} 50%, #7b3cf5))`, color: heroInk }}
        >
          {!minimal && !d.heroUrl && (<><div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/10" /><div className="absolute right-1/3 -bottom-32 w-80 h-80 rounded-full bg-white/10" /></>)}
          <div className={cn("relative grid items-center gap-10", !minimal && (popular.length || (bold && d.heroUrl)) && "@4xl:grid-cols-[1.15fr_0.85fr]")}>
            <div>
              {status && (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-semibold mb-6" style={{ background: minimal ? t.soft : "rgba(255,255,255,0.18)", color: minimal ? t.text : "inherit" }}>
                  <i className="w-2 h-2 rounded-full" style={{ background: status.open ? "#34d399" : "#fb7185" }} /> {status.text}
                </span>
              )}
              <h1 className={cn("font-extrabold leading-[1.04] tracking-[-0.035em]", bold ? "text-[42px] @3xl:text-[72px]" : "text-[36px] @3xl:text-[58px]")}>{headline}</h1>
              {d.tagline && <p className="mt-5 text-[17px] @3xl:text-[20px] leading-relaxed max-w-[580px]" style={{ opacity: minimal ? 1 : 0.9, color: minimal ? t.muted : undefined }}>{d.tagline}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                {primary && <Btn href={primary.href} t={t} kind={minimal ? "solid" : "light"} preview={preview}><primary.icon className="w-4 h-4" />{primary.label}</Btn>}
                {secondary && <Btn href={secondary.href} t={t} kind="ghost" preview={preview}>{secondary.label} <ArrowRight className="w-4 h-4" /></Btn>}
              </div>
            </div>
            {!minimal && bold && d.heroUrl && <img src={d.heroUrl} alt="" referrerPolicy="no-referrer" className="w-full aspect-[4/3] object-cover rounded-[26px] shadow-2xl" />}
            {!minimal && !(bold && d.heroUrl) && popular.length > 0 && (
              <div className="hidden @4xl:block relative">
                <div className="rounded-[26px] p-5 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.16)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25), 0 30px 60px -30px rgba(0,0,0,0.5)" }}>
                  <div className="text-[12.5px] font-bold uppercase tracking-[0.12em] opacity-80 mb-3">Popular right now</div>
                  <div className="space-y-2.5">
                    {popular.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: "rgba(255,255,255,0.92)", color: "#0f1330" }}>
                        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0"><Tile p={p} t={{ ...t, soft: "#eef0ff", dark: false }} size="sm" /></div>
                        <div className="min-w-0 flex-1"><div className="font-bold text-[14.5px] truncate">{p.name}</div><div className="text-[12px] opacity-60 truncate">{p.category || d.typeLabel}</div></div>
                        <div className="font-extrabold text-[14px] tabular-nums pr-1" style={{ color: d.accent }}>{fmtMoney(p.price, d.currency)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {minimal && d.heroUrl && <img src={d.heroUrl} alt="" referrerPolicy="no-referrer" className="max-w-[1240px] mx-auto mt-8 w-full aspect-[21/9] object-cover rounded-[28px]" />}
      </section>

      {/* Sections, in the owner's order */}
      <main>
        {order.map((k, i) => {
          if (k === "stats") return <section key={k} id={`sec-${k}`} className="px-5 @3xl:px-10 pt-10 @3xl:pt-14"><div className="max-w-[1120px] mx-auto">{render.stats()}</div></section>;
          if (k === "cta") return <section key={k} id={`sec-${k}`} className="px-4 @3xl:px-8 py-12 @3xl:py-20"><div className="max-w-[1240px] mx-auto">{render.cta()}</div></section>;
          const banded = !minimal && order.filter((x, j) => j <= i && x !== "stats" && x !== "cta").length % 2 === 0;
          return (
            <section key={k} id={`sec-${k}`} className="px-5 @3xl:px-10 py-14 @3xl:py-24" style={banded ? { background: band, borderTop: `1px solid ${t.line}`, borderBottom: `1px solid ${t.line}` } : undefined}>
              <div className="max-w-[1120px] mx-auto">{render[k]()}</div>
            </section>
          );
        })}
      </main>

      {/* Footer */}
      <footer className="px-5 @3xl:px-10 pt-14 pb-8" style={{ background: t.dark ? "#070916" : "#0f1330", color: "#c9cdea" }}>
        <div className="max-w-[1120px] mx-auto grid gap-10 @3xl:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              {d.logoUrl ? <img src={d.logoUrl} alt="" className="w-10 h-10 rounded-xl object-cover" referrerPolicy="no-referrer" /> : <span className="w-10 h-10 rounded-xl grid place-items-center font-extrabold" style={{ background: t.accent, color: t.onAccent }}>{d.name.slice(0, 1).toUpperCase()}</span>}
              <span className="font-extrabold text-[18px] text-white">{d.name}</span>
            </div>
            {d.tagline && <p className="mt-4 text-[14.5px] leading-relaxed max-w-[360px]">{d.tagline}</p>}
            {socials.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {socials.map((s) => <a key={s.key} href={preview ? undefined : s.href} target="_blank" rel="noopener noreferrer" className="h-9 px-4 rounded-full text-[13px] font-semibold inline-flex items-center" style={{ background: "rgba(255,255,255,0.08)", color: "#fff" }}>{s.label}</a>)}
              </div>
            )}
          </div>
          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-white/60 mb-4">Explore</div>
            <ul className="space-y-2.5 text-[14.5px]">{navLinks.map((k) => <li key={k}><a href={go(k)} className="hover:text-white">{LABELS[k]}</a></li>)}</ul>
          </div>
          <div>
            <div className="text-[12.5px] font-bold uppercase tracking-[0.14em] text-white/60 mb-4">Contact</div>
            <ul className="space-y-2.5 text-[14.5px]">
              {d.contact.address && <li>{d.contact.address}</li>}
              {d.contact.phone && <li>{d.contact.phone}</li>}
              {d.contact.email && <li className="break-all">{d.contact.email}</li>}
            </ul>
          </div>
        </div>
        <div className="max-w-[1120px] mx-auto mt-10 pt-6 flex flex-wrap justify-between gap-3 text-[12.5px]" style={{ borderTop: "1px solid rgba(255,255,255,0.1)", color: "#8e93b8" }}>
          <span>© {new Date().getFullYear()} {d.name}. All rights reserved.</span>
          <span>Powered by <a href={preview ? undefined : "/"} className="font-semibold text-white hover:underline">StarTrack</a></span>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      {!preview && wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp" className="fixed bottom-5 right-5 z-40 grid place-items-center w-14 h-14 rounded-full text-white transition-transform hover:scale-105" style={{ background: "#25d366", boxShadow: "0 14px 28px -10px rgba(37,211,102,0.7)" }}>
          <MessageCircle className="w-7 h-7" fill="#fff" strokeWidth={1.5} />
        </a>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 grid place-items-center p-5" style={{ background: "rgba(5,7,20,0.9)" }} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className="absolute top-5 right-5 grid place-items-center w-11 h-11 rounded-full bg-white/15 text-white" aria-label="Close" onClick={() => setLightbox(null)}><X className="w-5 h-5" /></button>
          <img src={lightbox} alt="" referrerPolicy="no-referrer" className="max-w-full max-h-[88vh] rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
