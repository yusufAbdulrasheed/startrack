import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, BedDouble, Blinds, Boxes, Briefcase, Check, ChevronDown, Droplets, Egg, FileSpreadsheet, GraduationCap, Globe,
  Menu, MessageCircle, QrCode, Receipt, ScanLine, Scissors, ShieldCheck, Smartphone, Sparkles, Store, TrendingUp, UtensilsCrossed, WifiOff, X,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { DemoButton } from "@/components/landing/DemoPicker";
import { PLANS, PLAN_ORDER, TRIAL_DAYS } from "#shared/plans.js";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRADIENT = "linear-gradient(135deg, #3538f0, #5a3bf4 60%, #7b3cf5)";

/* ── Buttons ─────────────────────────────────────────────────────── */
const primaryBtn = "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5";
const primaryShadow = { background: GRADIENT, boxShadow: "0 16px 32px -14px rgba(53,56,240,0.8)" };
const ghostOnDark = "inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[15px] font-bold text-white border border-white/25 bg-white/5 hover:bg-white/10 transition-colors";

/* ── Nav ─────────────────────────────────────────────────────────── */
const LINKS = [["Features", "#features"], ["AI", "#ai"], ["Industries", "#industries"], ["Pricing", "#pricing"], ["FAQ", "#faq"]] as const;

function Logo({ dark }: { dark?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="StarTrack">
      <span className="grid place-items-center w-9 h-9 rounded-xl text-white" style={{ background: GRADIENT, boxShadow: "0 10px 20px -10px rgba(53,56,240,0.9)" }}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l5-6 4 3 7-9" /><path d="M16 5h4v4" /></svg>
      </span>
      <span className={cn("font-extrabold text-[19px] tracking-[-0.02em]", dark ? "text-white" : "text-t1")}>StarTrack</span>
    </Link>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="max-w-[1180px] mx-auto px-5 h-[76px] flex items-center gap-8">
        <Logo dark />
        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {LINKS.map(([l, h]) => <a key={l} href={h} className="px-3.5 py-2 rounded-full text-[14px] font-semibold text-white/75 hover:text-white hover:bg-white/10 transition-colors">{l}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="hidden sm:grid !text-white/80 hover:!text-white" />
          <Link to="/login" className="hidden sm:inline-flex h-10 px-4 items-center text-[14px] font-semibold text-white/85 hover:text-white">Sign in</Link>
          <Link to="/register" className="hidden sm:inline-flex items-center h-10 px-5 rounded-full text-[14px] font-bold text-[#0a1045] bg-white hover:bg-white/90 transition-colors">Start free trial</Link>
          <button onClick={() => setOpen((o) => !o)} aria-label="Menu" className="lg:hidden grid place-items-center w-10 h-10 rounded-full bg-white/10 text-white">{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden mx-4 rounded-3xl bg-[#0f1550]/95 backdrop-blur border border-white/10 p-4 space-y-1">
          {LINKS.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="block px-4 py-3 rounded-2xl text-[15px] font-semibold text-white/85 hover:bg-white/10">{l}</a>)}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Link to="/login" className="h-11 grid place-items-center rounded-full border border-white/20 text-white font-semibold text-[14px]">Sign in</Link>
            <Link to="/register" className="h-11 grid place-items-center rounded-full bg-white text-[#0a1045] font-bold text-[14px]">Start free trial</Link>
          </div>
        </div>
      )}
    </header>
  );
}

/* ── Hero mockup, drawn in CSS so it's always crisp ─────────────── */
function MiniChart() {
  const pts = [18, 26, 22, 34, 30, 44, 38, 52, 47, 60, 56, 72];
  const w = 300, h = 90;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map((p) => h - (p / 80) * h);
  const line = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[90px]" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".45" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#lg1)" />
      <path d={line} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function HeroMockup() {
  const rows = [["Jollof Rice", 86, "₦215,000"], ["Chapman 500ml", 64, "₦115,200"], ["Puff Puff ×10", 41, "₦49,200"]] as const;
  return (
    <div className="relative mx-auto w-full max-w-[560px]">
      <div className="absolute -inset-10 rounded-full blur-3xl opacity-60" style={{ background: "radial-gradient(closest-side, rgba(123,60,245,0.55), transparent)" }} />
      {/* Window */}
      <div className="relative rounded-[26px] bg-white border border-white/60 overflow-hidden" style={{ boxShadow: "0 50px 90px -30px rgba(3,6,40,0.85), 0 0 0 1px rgba(255,255,255,0.4)" }}>
        <div className="flex items-center gap-1.5 px-4 h-9 bg-[#f1f2fb] border-b border-[#e6e8f4]"><i className="w-2.5 h-2.5 rounded-full bg-[#ff6b6b]" /><i className="w-2.5 h-2.5 rounded-full bg-[#ffc14d]" /><i className="w-2.5 h-2.5 rounded-full bg-[#3ccf91]" /><span className="ml-3 text-[10.5px] font-semibold text-[#8a8fb0]">startrack.app / dashboard</span></div>
        <div className="flex">
          <div className="hidden sm:flex w-14 flex-col items-center gap-3.5 py-4 bg-[#0f1550]">
            {[Store, ScanLine, Boxes, Receipt, Sparkles].map((I, i) => <span key={i} className={cn("grid place-items-center w-8 h-8 rounded-xl", i === 0 ? "bg-white/15 text-white" : "text-white/50")}><I className="w-4 h-4" /></span>)}
          </div>
          <div className="flex-1 p-4 sm:p-5 bg-[#f7f8fd] min-w-0">
            <div className="text-[11px] font-semibold text-[#8a8fb0]">Good afternoon, Ada</div>
            <div className="rounded-2xl text-white overflow-hidden mt-2" style={{ background: "linear-gradient(115deg,#1d1f9e,#3538f0 50%,#7b3cf5)" }}>
              <div className="px-4 pt-3.5 flex items-start justify-between">
                <div><div className="text-[10.5px] font-semibold text-white/75">Revenue today</div><div className="mt-1 font-mono font-extrabold text-[26px] leading-none tracking-[-0.03em]">₦1,284,500</div></div>
                <span className="px-2 py-1 rounded-full bg-white/20 text-[10.5px] font-bold flex items-center gap-1"><TrendingUp className="w-3 h-3" /> +18%</span>
              </div>
              <MiniChart />
            </div>
            <div className="grid grid-cols-3 gap-2.5 mt-3">
              {[["Sales", "86"], ["Profit", "₦412k"], ["Low stock", "4"]].map(([l, v], i) => (
                <div key={l} className="rounded-xl bg-white border border-[#e6e8f4] px-3 py-2.5"><div className="text-[10px] font-semibold text-[#8a8fb0]">{l}</div><div className={cn("font-mono font-extrabold text-[15px] mt-0.5", i === 2 ? "text-[#cc9933]" : "text-[#101436]")}>{v}</div></div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-white border border-[#e6e8f4] p-3 space-y-2.5">
              <div className="text-[11px] font-bold text-[#101436]">Top selling</div>
              {rows.map(([n, p, v]) => (
                <div key={n} className="flex items-center gap-2.5">
                  <span className="w-1/3 text-[11px] font-semibold text-[#3a3f66] truncate">{n}</span>
                  <span className="flex-1 h-1.5 rounded-full bg-[#eceefb] overflow-hidden"><i className="block h-full rounded-full" style={{ width: `${p}%`, background: GRADIENT }} /></span>
                  <span className="text-[10.5px] font-mono font-bold text-[#101436] w-[64px] text-right">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating proof points */}
      <div className="absolute -left-3 sm:-left-14 -bottom-6 w-[210px] rounded-2xl bg-white p-3 border border-[#e6e8f4] animate-[st-float_6s_ease-in-out_infinite]" style={{ boxShadow: "0 24px 48px -20px rgba(3,6,40,0.6)" }}>
        <div className="flex items-start gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-xl text-white shrink-0" style={{ background: GRADIENT }}><Sparkles className="w-4 h-4" /></span>
          <div className="min-w-0"><div className="text-[11.5px] font-bold text-[#101436]">AI read menu.xlsx</div><div className="text-[10.5px] text-[#6b7094] leading-snug">42 items ready · 3 duplicates skipped</div></div>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-bold text-[#0f9f6e]"><Check className="w-3 h-3" /> Review &amp; approve</div>
      </div>
      <div className="absolute -right-2 sm:-right-9 bottom-14 w-[190px] rounded-2xl bg-white p-3 border border-[#e6e8f4] animate-[st-float_7s_ease-in-out_infinite_1.2s]" style={{ boxShadow: "0 24px 48px -20px rgba(3,6,40,0.6)" }}>
        <div className="flex items-center gap-2"><span className="grid place-items-center w-8 h-8 rounded-xl bg-[#e8f8f1] text-[#0f9f6e]"><MessageCircle className="w-4 h-4" /></span><div><div className="text-[11.5px] font-bold text-[#101436]">Receipt sent</div><div className="text-[10.5px] text-[#6b7094]">₦7,500 · WhatsApp</div></div></div>
      </div>
      <div className="absolute -right-2 sm:-right-6 -top-5 rounded-2xl bg-white px-3 py-2.5 border border-[#e6e8f4] flex items-center gap-2 animate-[st-float_8s_ease-in-out_infinite_.6s]" style={{ boxShadow: "0 24px 48px -20px rgba(3,6,40,0.6)" }}>
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-[#fff3e2] text-[#cc9933]"><AlertTriangle className="w-3.5 h-3.5" /></span>
        <div><div className="text-[11px] font-bold text-[#101436]">Low stock</div><div className="text-[10px] text-[#6b7094]">Indomie · 3 left</div></div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden text-white" style={{ background: "radial-gradient(1100px 600px at 80% -10%, #3a2fd6 0%, transparent 60%), radial-gradient(900px 500px at -10% 40%, #1d2bb8 0%, transparent 55%), #070b33" }}>
      <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "linear-gradient(180deg, #000 0%, transparent 75%)" }} />
      <Nav />
      <div className="relative max-w-[1180px] mx-auto px-5 pt-[132px] pb-28 grid lg:grid-cols-[1.02fr_1fr] gap-16 items-center">
        <div>
          <a href="#ai" className="inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-[13px] font-semibold text-white/90 hover:bg-white/15 transition-colors">
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: GRADIENT }}>New</span> AI that reads your spreadsheets <ArrowRight className="w-3.5 h-3.5" />
          </a>
          <h1 className="mt-6 text-[44px] sm:text-[62px] lg:text-[68px] font-extrabold leading-[1.02] tracking-[-0.04em]">
            Run your whole business from <span style={{ background: "linear-gradient(100deg,#9ba0ff,#d6a8ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>one place.</span>
          </h1>
          <p className="mt-6 text-[18px] sm:text-[20px] leading-relaxed text-white/75 max-w-[540px]">
            Sales, stock, staff and customers for shops, restaurants, farms, salons and more. Simple enough for day one, powerful enough for ten branches.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className={primaryBtn} style={primaryShadow}>Start your {TRIAL_DAYS}-day trial <ArrowRight className="w-4 h-4" /></Link>
            <DemoButton className={ghostOnDark}>Try the live demo</DemoButton>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-white/65">
            {[`${TRIAL_DAYS} days free, no card`, "Priced in naira", "Works with spotty internet"].map((t) => <span key={t} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-[#7ee0b5]" strokeWidth={2.6} /> {t}</span>)}
          </div>
        </div>
        <HeroMockup />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-20" style={{ background: "linear-gradient(180deg, transparent, var(--st-canvas))" }} />
    </section>
  );
}

/* ── Trust strip ─────────────────────────────────────────────────── */
function Strip() {
  const items = [
    [WifiOff, "Keeps selling offline", "The till syncs when the network is back"],
    [MessageCircle, "WhatsApp receipts", "Send a receipt in one tap"],
    [ShieldCheck, "Your data, your control", "Roles, PINs and a full audit trail"],
    [Globe, "Built for Nigeria", "Naira, VAT and the way you trade"],
  ] as const;
  return (
    <section className="relative -mt-2 px-5">
      <div className="max-w-[1180px] mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-px rounded-3xl overflow-hidden border border-line bg-line shadow-e2">
        {items.map(([I, t, s]) => (
          <div key={t} className="bg-surface px-6 py-5 flex gap-3.5 items-start">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary-soft text-primary shrink-0"><I className="w-5 h-5" /></span>
            <div><div className="text-[14.5px] font-bold text-t1">{t}</div><div className="text-[12.5px] text-t3 leading-snug mt-0.5">{s}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Section scaffolding ─────────────────────────────────────────── */
function Heading({ eyebrow, title, sub, center = true }: { eyebrow: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-[680px]", center && "mx-auto text-center")}>
      <div className="inline-flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.16em] text-primary"><i className="w-6 h-[2px] rounded-full bg-primary" /> {eyebrow}</div>
      <h2 className="mt-4 text-[34px] sm:text-[46px] font-extrabold tracking-[-0.03em] leading-[1.06] text-t1">{title}</h2>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-t3">{sub}</p>}
    </div>
  );
}

/* ── Features bento ──────────────────────────────────────────────── */
function Features() {
  const card = "relative overflow-hidden rounded-[28px] border border-line bg-surface p-7 shadow-e1 transition-all hover:-translate-y-1 hover:shadow-e3";
  const chip = (I: any, tone = "bg-primary-soft text-primary") => <span className={cn("grid place-items-center w-11 h-11 rounded-2xl", tone)}><I className="w-5 h-5" strokeWidth={1.9} /></span>;
  return (
    <section id="features" className="px-5 py-24 lg:py-32">
      <div className="max-w-[1180px] mx-auto">
        <Heading eyebrow="Everything you need" title="One system. Every part of the shop." sub="Start with a till and a stock list. Add the rest when you're ready, and only pay for what you use." />
        <div className="mt-14 grid md:grid-cols-6 gap-5">
          <div className={cn(card, "md:col-span-4")}>
            {chip(ScanLine)}
            <h3 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em] text-t1">A till that never makes customers wait</h3>
            <p className="mt-2 text-[15px] text-t3 leading-relaxed max-w-[460px]">Cash, POS and transfer in one screen. Split payments, discounts, VAT and change handled for you, with a receipt ready to print or WhatsApp.</p>
            <div className="mt-6 flex flex-wrap gap-2">{["Split payments", "Discounts", "VAT", "Returns", "Held sales", "Barcode scan"].map((t) => <span key={t} className="px-3 py-1.5 rounded-full bg-surface-3 text-[12.5px] font-semibold text-t2">{t}</span>)}</div>
          </div>
          <div className={cn(card, "md:col-span-2 text-white border-transparent")} style={{ background: "linear-gradient(150deg,#1d1f9e,#3538f0 55%,#7b3cf5)" }}>
            {chip(Sparkles, "bg-white/15 text-white")}
            <h3 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em]">AI that does the typing</h3>
            <p className="mt-2 text-[15px] text-white/80 leading-relaxed">Ask about your sales, draft actions, or upload a spreadsheet and watch your catalogue appear.</p>
          </div>
          <div className={cn(card, "md:col-span-2")}>
            {chip(Boxes, "bg-success-soft text-success")}
            <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-t1">Stock that stays honest</h3>
            <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">Every unit in and out is logged. Low-stock and expiry alerts arrive before a shelf runs empty.</p>
          </div>
          <div className={cn(card, "md:col-span-2")}>
            {chip(Store, "bg-warning-soft text-warning")}
            <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-t1">Many branches, one view</h3>
            <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">Separate stock and staff per branch, plus a single dashboard comparing profit and loss across them all.</p>
          </div>
          <div className={cn(card, "md:col-span-2")}>
            {chip(FileSpreadsheet, "bg-danger-soft text-danger")}
            <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-t1">Reports you can hand over</h3>
            <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">Beautiful PDF and Excel reports for sales, stock, customers and staff, ready for your accountant.</p>
          </div>
          <div className={cn(card, "md:col-span-3")}>
            {chip(QrCode)}
            <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-t1">Loyalty cards customers actually use</h3>
            <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">A QR card in their phone. Scan at the till and the discount applies itself.</p>
          </div>
          <div className={cn(card, "md:col-span-3")}>
            {chip(Globe, "bg-success-soft text-success")}
            <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.02em] text-t1">Your own business page</h3>
            <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">A branded landing page with your products, hours and WhatsApp button, shareable by link or QR code.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── AI ──────────────────────────────────────────────────────────── */
function AiSection() {
  return (
    <section id="ai" className="px-5 py-24 lg:py-32 bg-surface-2 border-y border-line">
      <div className="max-w-[1180px] mx-auto grid lg:grid-cols-2 gap-14 items-center">
        <div className="order-2 lg:order-1">
          <div className="rounded-[28px] bg-surface border border-line shadow-e3 p-5 sm:p-6 max-w-[520px] mx-auto">
            <div className="flex items-center gap-2.5 pb-4 border-b border-line">
              <span className="grid place-items-center w-9 h-9 rounded-xl text-white" style={{ background: GRADIENT }}><Sparkles className="w-4 h-4" /></span>
              <div><div className="text-[14px] font-bold text-t1">StarTrack AI</div><div className="text-[11.5px] text-success font-semibold">● Online</div></div>
            </div>
            <div className="py-5 space-y-4 text-[13.5px]">
              <div className="flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 text-white" style={{ background: GRADIENT }}><span className="inline-flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> menu.xlsx</span><div className="mt-1 opacity-90">Add these to my catalogue</div></div></div>
              <div className="max-w-[88%] rounded-2xl rounded-bl-md px-4 py-3 bg-surface-3 text-t1 leading-relaxed">I read <b>Sheet “Menu”</b> and found <b>42 dishes</b>. 3 are already in your catalogue, so I'll skip them. Here's what I'll add:</div>
              <div className="rounded-2xl border border-line overflow-hidden">
                <div className="grid grid-cols-3 text-center divide-x divide-line bg-surface-2">
                  {[["39", "to add", "text-success"], ["3", "already there", "text-t2"], ["1", "needs a look", "text-warning"]].map(([n, l, c]) => <div key={l} className="py-3"><div className={cn("text-[20px] font-extrabold font-mono", c)}>{n}</div><div className="text-[11px] text-t3 font-semibold">{l}</div></div>)}
                </div>
                {[["Jollof Rice", "₦2,500"], ["Suya Platter", "₦4,500"], ["Pepper Soup", "₦5,200"]].map(([n, p]) => <div key={n} className="flex justify-between px-4 py-2 text-[12.5px] border-t border-line"><span className="text-t2 font-semibold">{n}</span><span className="font-mono text-t1">{p}</span></div>)}
              </div>
              <div className="flex gap-2"><span className="h-10 px-5 rounded-full text-white font-bold inline-flex items-center gap-2" style={{ background: GRADIENT }}><Check className="w-4 h-4" /> Add 39 items</span><span className="h-10 px-5 rounded-full border border-line-2 text-t2 font-bold inline-flex items-center">Discard</span></div>
            </div>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <Heading center={false} eyebrow="AI assistant" title="Show it a spreadsheet. Skip the data entry." sub="Upload your product list in any layout. StarTrack reads it, matches your columns, skips duplicates and shows you exactly what it will add before anything changes." />
          <ul className="mt-8 space-y-4">
            {[
              ["Ask in plain English", "“Who owes me money?” “What sold best this week?” Answers come from your real numbers."],
              ["Nothing happens without you", "The AI drafts, you approve. Every change is a preview first."],
              ["Reports on request", "“Download last month's sales as Excel.” Done, formatted and ready to share."],
            ].map(([t, s]) => (
              <li key={t} className="flex gap-3.5">
                <span className="grid place-items-center w-7 h-7 rounded-full bg-success-soft text-success shrink-0 mt-0.5"><Check className="w-4 h-4" strokeWidth={2.6} /></span>
                <div><div className="text-[16px] font-bold text-t1">{t}</div><div className="text-[14.5px] text-t3 leading-relaxed">{s}</div></div>
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register?plan=pro" className={primaryBtn} style={primaryShadow}>Try AI with Pro <ArrowRight className="w-4 h-4" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Industries ──────────────────────────────────────────────────── */
const INDUSTRIES = [
  { icon: Store, title: "Supermarkets & shops", body: "Barcodes, expiry dates and reorder alerts." },
  { icon: UtensilsCrossed, title: "Restaurants", body: "Orders to the kitchen, recipes that deduct ingredients." },
  { icon: Blinds, title: "Blinds & curtains", body: "Priced per square metre from stock you hold." },
  { icon: Smartphone, title: "Electronics", body: "Serial numbers, warranty and repairs per unit." },
  { icon: BedDouble, title: "Hotels", body: "Rooms, folios and a kitchen that bills to the room." },
  { icon: Droplets, title: "Water factories", body: "Raw materials in, pure water out, yield measured." },
  { icon: Egg, title: "Poultry farms", body: "Feed, mortality and harvest tracked per batch." },
  { icon: GraduationCap, title: "Training academies", body: "Courses, intakes, fees in instalments, attendance." },
  { icon: Scissors, title: "Salons & spas", body: "Appointments by stylist with deposits and balances." },
  { icon: Briefcase, title: "Agencies", body: "Projects, milestones and billing as you deliver." },
];

function Industries() {
  return (
    <section id="industries" className="px-5 py-24 lg:py-32">
      <div className="max-w-[1180px] mx-auto">
        <Heading eyebrow="Built for how you trade" title="Not a generic till. Your trade, understood." sub="StarTrack adapts its screens, units and rules to the kind of business you run." />
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {INDUSTRIES.map(({ icon: I, title, body }) => (
            <div key={title} className="group rounded-3xl border border-line bg-surface p-5 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-e2">
              <span className="grid place-items-center w-11 h-11 rounded-2xl bg-primary-soft text-primary transition-colors group-hover:text-white group-hover:bg-primary"><I className="w-5 h-5" strokeWidth={1.8} /></span>
              <h3 className="mt-4 text-[15.5px] font-extrabold text-t1 leading-tight">{title}</h3>
              <p className="mt-1.5 text-[13px] text-t3 leading-snug">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────────────── */
function Steps() {
  const steps = [
    ["1", "Create your account", "Pick your trade and we set up the right screens, units and rules. It takes a couple of minutes."],
    ["2", "Add your products", "Type them in, import a CSV, or upload any spreadsheet and let the AI do it."],
    ["3", "Start selling", "Open the till, ring up a sale, send the receipt. Your dashboard fills itself."],
  ];
  return (
    <section className="px-5 py-24 bg-surface-2 border-y border-line">
      <div className="max-w-[1180px] mx-auto">
        <Heading eyebrow="How it works" title="Up and running today." />
        <div className="mt-14 grid md:grid-cols-3 gap-6 relative">
          {steps.map(([n, t, s]) => (
            <div key={n} className="relative rounded-[28px] bg-surface border border-line p-7 shadow-e1">
              <span className="grid place-items-center w-12 h-12 rounded-2xl text-white text-[20px] font-extrabold" style={{ background: GRADIENT, boxShadow: "0 14px 26px -12px rgba(53,56,240,0.8)" }}>{n}</span>
              <h3 className="mt-5 text-[20px] font-extrabold tracking-[-0.01em] text-t1">{t}</h3>
              <p className="mt-2 text-[14.5px] text-t3 leading-relaxed">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing, straight from the plan definitions the app enforces ── */
function Pricing() {
  return (
    <section id="pricing" className="px-5 py-24 lg:py-32">
      <div className="max-w-[1180px] mx-auto">
        <Heading eyebrow="Pricing" title="Simple plans. Start with a free trial." sub={`Every plan starts with ${TRIAL_DAYS} days free. Pay monthly in naira, and nothing renews by itself.`} />
        <div className="mt-16 grid md:grid-cols-3 gap-6 items-stretch">
          {PLAN_ORDER.map((k) => {
            const p = PLANS[k];
            const hot = k === "pro";
            return (
              <div key={k} className={cn("relative rounded-[30px] p-8 flex flex-col", hot ? "text-white border-transparent shadow-e3 md:-my-4" : "bg-surface border border-line shadow-e1")}
                style={hot ? { background: "linear-gradient(160deg,#1d1f9e,#3538f0 50%,#7b3cf5)", boxShadow: "0 40px 70px -30px rgba(53,56,240,0.7)" } : undefined}>
                {hot && <span className="absolute -top-3.5 left-8 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold bg-white text-[#3538f0] shadow-e2">Most popular</span>}
                <h3 className={cn("text-[22px] font-extrabold", !hot && "text-t1")}>{p.name}</h3>
                <p className={cn("mt-1 text-[14px]", hot ? "text-white/75" : "text-t3")}>{p.tagline}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className={cn("text-[46px] font-extrabold tracking-[-0.04em] leading-none", !hot && "text-t1")}>{fmtMoney(p.price, "₦")}</span>
                  <span className={cn("text-[14px]", hot ? "text-white/70" : "text-t3")}>/ month</span>
                </div>
                <Link to={`/register?plan=${k}`}
                  className={cn("mt-7 h-12 rounded-full inline-flex items-center justify-center gap-2 text-[15px] font-bold transition-transform hover:-translate-y-0.5", hot ? "bg-white text-[#3538f0]" : k === "business" ? "text-white bg-[#101436]" : "border border-line-2 text-t1 hover:border-primary hover:text-primary")}>
                  Try {p.name} free <ArrowRight className="w-4 h-4" />
                </Link>
                <ul className="mt-8 space-y-3">
                  {p.highlights.map((h) => (
                    <li key={h} className={cn("flex items-start gap-2.5 text-[14px]", hot ? "text-white/90" : "text-t2")}>
                      <Check className={cn("w-[18px] h-[18px] mt-0.5 shrink-0", hot ? "text-[#9be9c6]" : "text-success")} strokeWidth={2.6} /> {h}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-[13.5px] text-t3">Pay securely by card, bank transfer or USSD. Prices in Nigerian naira.</p>
      </div>
    </section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────── */
const FAQS = [
  ["Is there a free trial?", `Yes. Every plan starts with ${TRIAL_DAYS} days free, no card needed. After that you pick a plan and pay monthly. If you don't, the account goes read-only: you can still view everything, but changes are paused until you renew.`],
  ["What do I get on Pro?", "Everything in Freemium, plus the AI assistant, PDF and Excel reports, barcodes and labels, loyalty cards, branch transfers, expiry tracking, suppliers, stock counts, returns, and a customisable receipt. Up to 3 branches and 10 staff."],
  ["What's different on Business?", "No limits on branches, staff or products, multiple businesses with an all-stores dashboard, designed receipt templates with an AI writer, your own public landing page, and the audit log."],
  ["What happens if I downgrade?", "Nothing is deleted. Your data stays, and features from the higher plan lock until you upgrade again. If you're over a limit, you simply can't add more until you're back under it."],
  ["How does payment work?", "You pay monthly through Paystack by card, bank transfer or USSD. Plans don't renew automatically, so there are no surprise charges. Pay again when you're ready to continue."],
  ["Does it work when the internet drops?", "The till keeps recording sales and syncs them when you're back online."],
  ["Can I try it before signing up?", "Yes. Open the live demo, pick your kind of business, and you'll land in a stocked sandbox with a week of sample sales. No sign-up needed."],
] as const;

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-5 py-24 bg-surface-2 border-t border-line">
      <div className="max-w-[820px] mx-auto">
        <Heading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-12 space-y-3">
          {FAQS.map(([q, a], i) => (
            <div key={q} className={cn("rounded-2xl bg-surface border transition-colors", open === i ? "border-primary/50 shadow-e2" : "border-line")}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left">
                <span className="text-[16.5px] font-bold text-t1">{q}</span>
                <ChevronDown className={cn("w-5 h-5 text-primary shrink-0 transition-transform", open === i && "rotate-180")} />
              </button>
              {open === i && <p className="px-6 pb-6 -mt-1 text-[15px] text-t3 leading-relaxed">{a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Final call + footer ─────────────────────────────────────────── */
function Closing() {
  return (
    <section className="px-5 py-24">
      <div className="max-w-[1180px] mx-auto relative overflow-hidden rounded-[40px] text-center text-white px-6 py-20" style={{ background: "radial-gradient(800px 400px at 80% 0%, #4a3be8 0%, transparent 60%), #0a1045" }}>
        <div className="absolute inset-0 opacity-[0.15]" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
        <div className="relative max-w-[640px] mx-auto">
          <h2 className="text-[36px] sm:text-[52px] font-extrabold tracking-[-0.035em] leading-[1.05]">Give your business the system it deserves.</h2>
          <p className="mt-5 text-[18px] text-white/75">Start your {TRIAL_DAYS}-day free trial in minutes. No card needed.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="inline-flex items-center gap-2 h-13 px-8 py-3.5 rounded-full text-[15.5px] font-bold bg-white text-[#0a1045] hover:-translate-y-0.5 transition-transform">Start free trial <ArrowRight className="w-4 h-4" /></Link>
            <DemoButton className={ghostOnDark}>Try the live demo</DemoButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="px-5 pb-12">
      <div className="max-w-[1180px] mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] pt-4">
        <div>
          <Logo />
          <p className="mt-4 text-[14px] text-t3 leading-relaxed max-w-[320px]">The operating system for small and growing businesses.</p>
        </div>
        {[
          ["Product", [["Features", "#features"], ["AI assistant", "#ai"], ["Pricing", "#pricing"], ["Industries", "#industries"]]],
          ["Get started", [["Create account", "/register"], ["Sign in", "/login"], ["FAQ", "#faq"]]],
        ].map(([title, links]) => (
          <div key={title as string}>
            <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-t4 mb-4">{title as string}</div>
            <ul className="space-y-2.5 text-[14.5px]">
              {(links as string[][]).map(([l, h]) => <li key={l}>{h.startsWith("#") ? <a href={h} className="text-t2 hover:text-primary">{l}</a> : <Link to={h} className="text-t2 hover:text-primary">{l}</Link>}</li>)}
            </ul>
          </div>
        ))}
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-t4 mb-4">Try it</div>
          <DemoButton className="text-[14.5px] text-t2 hover:text-primary font-medium">Live demo</DemoButton>
        </div>
      </div>
      <div className="max-w-[1180px] mx-auto mt-12 pt-6 border-t border-line text-[13px] text-t4 flex flex-wrap justify-between gap-3">
        <span>© {new Date().getFullYear()} StarTrack. All rights reserved.</span>
        <span>Made for businesses that mean business.</span>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="bg-canvas text-t1 overflow-x-hidden" style={{ scrollBehavior: "smooth" }}>
      <Hero />
      <Strip />
      <Features />
      <AiSection />
      <Industries />
      <Steps />
      <Pricing />
      <Faq />
      <Closing />
      <Footer />
    </div>
  );
}
