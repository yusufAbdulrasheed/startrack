import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Boxes, Menu, ScanLine, Users, X,
  Wallet, Receipt, UserCog, History,
  Store, RefreshCw, Sparkles, Search,
  Blinds, Smartphone, BedDouble, UtensilsCrossed, Droplets, Egg,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/* Landing uses its own solid button style on purpose — no gradients on buttons. */
const btnSolid =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-ctl bg-brand-700 text-white hover:bg-brand-600 active:scale-[0.98] transition-all disabled:opacity-50";

type DemoShop = {
  key: string; label: string; group: string; depth: "full" | "catalog"; pending: string;
  blurb: string; business: string; highlight: string; products: number;
};

const SHOP_ICON: Record<string, any> = {
  blinds: Blinds, electronics: Smartphone, hotel: BedDouble,
  restaurant: UtensilsCrossed, water: Droplets, poultry: Egg,
};

/**
 * Choosing the trade before the sandbox is built. A pharmacist landing in a
 * supermarket learns nothing about whether StarTrack suits them — the demo is
 * only persuasive if it speaks their vocabulary from the first screen.
 *
 * Shops whose trade-specific workflow is still being built say so on the card
 * rather than letting someone find out by looking for a feature that isn't
 * there yet.
 */
function DemoPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { demoLogin } = useSession();
  const navigate = useNavigate();
  const [shops, setShops] = useState<DemoShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setQ("");
    api<{ shops: DemoShop[] }>("/auth/demo/shops")
      .then((r) => setShops(r.shops))
      .catch(() => setError("Couldn't load the demo shops. Try again in a moment."))
      .finally(() => setLoading(false));
  }, [open]);

  async function start(key: string) {
    setStarting(key);
    setError("");
    try {
      await demoLogin(key);
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not start the demo");
      setStarting(null);
    }
  }

  const term = q.trim().toLowerCase();
  const matches = term
    ? shops.filter((s) =>
        [s.label, s.business, s.blurb, s.group].some((f) => f.toLowerCase().includes(term))
      )
    : shops;

  // Keep the server's grouping, but only for groups that still have matches.
  const groups = matches.reduce<Record<string, DemoShop[]>>((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      onClose={starting ? () => {} : onClose}
      title="Which shop would you like to try?"
      subtitle="Each one is stocked with a week of real trading. Sell, void, approve a return — it resets in 24 hours."
      wide
    >
      {error && <div className="mb-3 px-3 py-2.5 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">{error}</div>}

      {!loading && shops.length > 6 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${shops.length} trades — blinds, poultry, hotel…`}
            className="w-full h-10 pl-9 pr-3 rounded-ctl bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : matches.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-t3">No trade matches “{q}”.</div>
      ) : (
        <div className="-mx-1 px-1 space-y-5">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group}>
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-t4 mb-2">{group}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {list.map((s) => {
                  const Icon = SHOP_ICON[s.key] || Store;
                  const busy = starting === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => start(s.key)}
                      disabled={!!starting}
                      className={cn(
                        "group text-left rounded-card border p-3.5 transition-all disabled:opacity-50",
                        busy ? "border-brand-400 bg-primary-softer" : "border-line bg-surface hover:border-brand-400 hover:shadow-e1"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                          <Icon className="w-[18px] h-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13.5px] font-bold text-t1 truncate">{s.label}</span>
                            {s.depth === "catalog" && (
                              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                                Catalog
                              </span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-t3 truncate">{s.business}</div>
                        </div>
                        {busy && <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />}
                      </div>
                      <p className="mt-2 text-[12px] text-t2 leading-snug">{s.blurb}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-t3">
                        <Sparkles className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate">{s.highlight}</span>
                      </div>
                      {s.pending && (
                        <p className="mt-2 pt-2 border-t border-line text-[10.5px] text-t4 leading-snug">{s.pending}</p>
                      )}
                      <div className="mt-1.5 text-[10.5px] text-t4">{s.products} products ready to sell</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-t4 text-center">
        No sign-up, no card. Everything you do stays in your own sandbox and disappears after 24 hours.
      </p>
    </Modal>
  );
}

// Opens the shop picker — the visitor chooses the trade, then the sandbox
// is built for it.
function DemoButton({ big = false, children }: { big?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={cn(btnSolid, big ? "h-[52px] px-7 text-[15px]" : "h-9 px-4 text-[13px]")} onClick={() => setOpen(true)}>
        {children}
      </button>
      <DemoPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}


/* ── The dashboard, tab by tab, as a slideshow ─────────────── */

const SLIDES = [
  { key: "overview", label: "Overview", icon: Wallet },
  { key: "sales", label: "Sales", icon: Receipt },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "customers", label: "Customers", icon: Users },
  { key: "staff", label: "Staff", icon: UserCog },
  { key: "archive", label: "Archive", icon: History },
];

function Tile({ v, l, tone }: { v: string; l: string; tone?: "success" | "warning" }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 text-left min-w-0">
      <div className={cn("text-[16px] font-bold font-mono truncate", tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-t1")}>{v}</div>
      <div className="text-[10px] text-t3 mt-0.5 truncate">{l}</div>
    </div>
  );
}

function BarRow({ label, sub, pct }: { label: string; sub: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] font-medium text-t2 truncate">{label}</span>
        <span className="text-[10px] font-mono text-t3 shrink-0 ml-2">{sub}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SlideOverview() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <Tile v="₦248,500" l="Today's revenue" />
        <Tile v="37" l="Sales" />
        <Tile v="₦61,300" l="Profit" tone="success" />
        <Tile v="4" l="Low stock" tone="warning" />
      </div>
      <div className="bg-surface border border-line rounded-xl p-3 h-36 flex items-end gap-1.5">
        {[38, 62, 48, 75, 58, 88, 70, 82, 66, 94, 78, 90].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-brand-600/85" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function SlideSales() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Tile v="₦4.1m" l="Revenue · 30 days" />
        <Tile v="₦6,890" l="Average sale" />
      </div>
      <div className="bg-surface border border-line rounded-xl p-3 space-y-2.5">
        <div className="text-[11px] font-bold text-t1">By staff</div>
        <BarRow label="Amaka" sub="212 sales" pct={95} />
        <BarRow label="Chidi" sub="167 sales" pct={72} />
        <BarRow label="Ngozi" sub="121 sales" pct={51} />
      </div>
    </div>
  );
}

function SlideInventory() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile v="128" l="Products" />
        <Tile v="₦2.3m" l="Stock value" />
        <Tile v="+640 / −587" l="In & out · 30d" />
      </div>
      <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
        {[["Kings Oil 5L", "3 left", true], ["Dangote Sugar 1kg", "5 left", true], ["Peak Milk 400g", "26 in stock", false]].map(([n, s, warn], i) => (
          <div key={i} className="flex justify-between items-center">
            <span className="text-[12px] font-medium text-t1">{n}</span>
            <span className={cn("text-[11px] font-mono font-semibold", warn ? "text-warning" : "text-t3")}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideCustomers() {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2.5">
      {[["Mama Nkechi", "14 visits", "₦186,400"], ["Alhaji Musa", "9 visits", "₦122,750"], ["Blessing Okoro", "6 visits", "₦74,300"]].map(([n, v, s], i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-full bg-primary-soft text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{String(n)[0]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-t1 truncate">{n}</div>
            <div className="text-[10px] text-t3">{v}</div>
          </div>
          <span className="font-mono text-[12px] font-bold text-t1">{s}</span>
        </div>
      ))}
    </div>
  );
}

function SlideStaff() {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2.5">
      <div className="grid grid-cols-4 text-[10px] font-bold uppercase tracking-wide text-t4 pb-1 border-b border-line">
        <span>Staff</span><span className="text-right">Sales</span><span className="text-right">Revenue</span><span className="text-right">Hours</span>
      </div>
      {[["Amaka", "212", "₦1.6m", "182h"], ["Chidi", "167", "₦1.2m", "170h"], ["Ngozi", "121", "₦840k", "154h"]].map((r, i) => (
        <div key={i} className="grid grid-cols-4 text-[12px]">
          <span className="font-semibold text-t1">{r[0]}</span>
          <span className="text-right font-mono text-t2">{r[1]}</span>
          <span className="text-right font-mono font-bold text-t1">{r[2]}</span>
          <span className="text-right font-mono text-t3">{r[3]}</span>
        </div>
      ))}
    </div>
  );
}

function SlideArchive() {
  return (
    <div className="bg-surface border border-line rounded-xl p-3 space-y-2">
      {[["R-00412", "Semovita ×2, Milo", "₦7,300", false], ["R-00411", "Kings Oil 5L", "₦7,500", false], ["R-00410", "Indomie carton ×2", "₦7,000", true]].map(([no, items, amt, voided], i) => (
        <div key={i} className={cn("flex items-center gap-2", voided && "opacity-45")}>
          <span className="font-mono text-[11px] font-bold text-primary shrink-0">{no}</span>
          <span className="text-[11px] text-t3 truncate flex-1">{items}</span>
          {voided ? <span className="text-[9px] font-bold uppercase text-danger shrink-0">void</span> : null}
          <span className="font-mono text-[12px] font-bold text-t1 shrink-0">{amt}</span>
        </div>
      ))}
      <div className="flex justify-between pt-1.5 border-t border-line text-[11px]">
        <span className="text-t3">This month</span>
        <span className="font-mono font-bold text-t1">947 sales · ₦4.1m</span>
      </div>
    </div>
  );
}

const SLIDE_BODY: Record<string, () => React.ReactElement> = {
  overview: SlideOverview, sales: SlideSales, inventory: SlideInventory,
  customers: SlideCustomers, staff: SlideStaff, archive: SlideArchive,
};

function DashboardShow() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % SLIDES.length), 3200);
    return () => clearInterval(t);
  }, [paused]);

  const Body = SLIDE_BODY[SLIDES[active].key];

  return (
    <div
      className="mx-auto max-w-3xl rounded-2xl border border-line-2 bg-canvas shadow-e2 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* tab strip — the real dashboard's tabs */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 bg-surface border-b border-line overflow-x-auto">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setActive(i)}
            className={cn(
              "flex items-center gap-1.5 px-3 h-8 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors",
              i === active ? "bg-primary-soft text-primary" : "text-t3 hover:text-t1"
            )}
          >
            <s.icon className="w-3.5 h-3.5" /> {s.label}
          </button>
        ))}
      </div>
      <div key={active} className="p-4 animate-fade-in min-h-[220px]">
        <Body />
      </div>
      {/* progress dots */}
      <div className="flex justify-center gap-1.5 pb-3 bg-canvas">
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setActive(i)}
            className={cn("h-1.5 rounded-full transition-all", i === active ? "w-6 bg-brand-600" : "w-1.5 bg-surface-3 border border-line-2")} />
        ))}
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

// The "Modular Power" trio — mapped straight onto real, shipped modules
// (POS/checkout, the stock_movements ledger, PIN + roster/attendance) so the
// pitch never outruns what the product actually does.
const MODULES = [
  { icon: ScanLine, title: "Unified POS", body: "Sync sales, inventory and payments in real time — cash, card and transfer, all reconciled automatically across every branch." },
  { icon: Boxes, title: "Smart Inventory", body: "Every unit in and out is logged automatically, with low-stock and expiry alerts before a shelf ever runs empty." },
  { icon: UserCog, title: "Staff Efficiency", body: "PIN logins, shift rosters and clock-in tracking keep the whole team accountable — no paperwork, no guesswork." },
];

// Sourced from the actual business-type templates (server/shared/businessTypes.js) —
// same taglines the product uses at sign-up, not separately invented marketing copy.
// The full list of six, matching what registration actually offers today.
const INDUSTRIES = [
  { icon: UtensilsCrossed, title: "Restaurant", body: "From order to kitchen — recipes that deduct real ingredients, not just items." },
  { icon: Blinds, title: "Window Blinds & Curtains", body: "Priced per square metre, cut from rail and fabric you already hold in stock." },
  { icon: Smartphone, title: "Electronics", body: "Serial-number-grade care — every unit tracked from stock-in to warranty and repair." },
  { icon: BedDouble, title: "Hospitality", body: "Rooms, folios and a kitchen that bills to the room — built for the front desk." },
  { icon: Droplets, title: "Water Factory", body: "Raw materials in, pure water out — production runs measure the yield in between." },
  { icon: Egg, title: "Poultry Farm", body: "Feed in, eggs and birds out — batches tracked through feed, mortality and harvest." },
];

function DeviceMockup() {
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-none">
      <div className="rounded-2xl bg-ink p-2.5 shadow-e2">
        <div className="rounded-[10px] overflow-hidden bg-canvas">
          <DashboardShow />
        </div>
      </div>
      <div className="flex flex-col items-center">
        <div className="w-3 h-7 bg-ink" />
        <div className="w-28 h-2.5 rounded-full bg-ink" />
      </div>
    </div>
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      <a href="#modules" onClick={() => setOpen(false)} className="hover:text-t1 transition-colors">Features</a>
      <a href="#industries" onClick={() => setOpen(false)} className="hover:text-t1 transition-colors">Industries</a>
    </>
  );
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/80 border-b border-line">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
              <path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="16" cy="15" r="3" fill="white" opacity=".9" />
            </svg>
          </div>
          <span className="font-display font-extrabold text-[17px] text-t1 tracking-tight">StarTrack</span>
        </div>
        <nav className="hidden md:flex items-center gap-7 mx-auto text-[13px] font-medium text-t2">{links}</nav>
        <div className="ml-auto md:ml-0 flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="hidden sm:inline-flex h-9 px-4 items-center text-[13px] font-semibold text-t2 hover:text-t1 transition-colors">
            Sign in
          </Link>
          <Link to="/register" className={cn(btnSolid, "h-9 px-4 text-[13px]")}>
            Get Started
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t2"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="md:hidden border-t border-line px-5 py-3 flex flex-col gap-3 text-[13px] font-medium text-t2 bg-surface">
          {links}
          <Link to="/login" onClick={() => setOpen(false)} className="text-t2 hover:text-t1">Sign in</Link>
        </nav>
      )}
    </header>
  );
}

export function Landing() {
  return (
    <div className="min-h-full bg-canvas overflow-x-hidden">
      <Nav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-16 md:pt-20 pb-20 grid lg:grid-cols-2 gap-14 items-center">
        <div className="text-center lg:text-left">
          <h1 className="font-display font-extrabold tracking-tight text-t1 text-[clamp(2.4rem,6vw,3.6rem)] leading-[1.08]">
            One Platform.<br />Every Trade.<br />
            <span className="bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">Infinite Growth.</span>
          </h1>
          <p className="mt-6 max-w-lg mx-auto lg:mx-0 text-[16px] leading-relaxed text-t2">
            The all-in-one business operations platform for restaurants, hotels, workshops and specialty trades —
            one unified, modular system that grows with you.
          </p>
          <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
            <Link to="/register" className={cn(btnSolid, "h-[52px] px-7 text-[15px]")}>
              Get Started for Free
            </Link>
            <DemoButton big>Watch Demo</DemoButton>
          </div>
          <div className="mt-4 flex items-center justify-center lg:justify-start gap-1.5 text-[13px] text-t3">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            No sign-up needed for the demo · Free while we pilot
          </div>
        </div>
        <DeviceMockup />
      </section>

      {/* Modular power */}
      <section id="modules" className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-display font-extrabold text-t1 text-[clamp(1.9rem,4.5vw,2.6rem)] tracking-tight">
              Modular Power for Any Operation
            </h2>
            <p className="mt-3 text-[15px] text-t2">
              Purpose-built tools that seamlessly integrate to give you complete control.
            </p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES.map((f) => (
              <div key={f.title} className="bg-canvas border border-line rounded-card p-6 transition-colors hover:border-brand-300">
                <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                  <f.icon className="w-[22px] h-[22px]" />
                </div>
                <h3 className="mt-4 font-bold text-[15px] text-t1">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-t3">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="max-w-6xl mx-auto px-5 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display font-extrabold text-t1 text-[clamp(1.9rem,4.5vw,2.6rem)] tracking-tight">
              Tailored for Your Industry
            </h2>
            <p className="mt-3 text-[15px] text-t2">
              Purpose-built modules ready to fit your specific business needs.
            </p>
          </div>
          <Link to="/register" className="text-[13px] font-semibold text-primary hover:text-primary-hover transition-colors whitespace-nowrap">
            See what fits your trade →
          </Link>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INDUSTRIES.map((f) => (
            <div key={f.title} className="bg-surface border border-line rounded-card p-6 transition-colors hover:border-brand-300">
              <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <f.icon className="w-[22px] h-[22px]" />
              </div>
              <h3 className="mt-4 font-bold text-[15px] text-t1">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-t3">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 pb-20">
        <div className="rounded-3xl bg-ink p-12 md:p-16 text-center">
          <h2 className="font-display font-extrabold text-white text-[clamp(2rem,4.5vw,2.8rem)] tracking-tight">
            Ready to transform your business operations?
          </h2>
          <p className="mt-3 text-white/70 text-[15px] max-w-lg mx-auto">
            Open a free sandbox and see it running with your own kind of business — no sign-up, no card.
          </p>
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 h-[52px] px-7 rounded-ctl bg-white text-ink font-semibold text-[15px] hover:bg-white/90 transition-colors">
              Register Now — Free Trial
            </Link>
            <DemoButton big>
              <>Try the demo <ArrowRight className="w-4 h-4" /></>
            </DemoButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-700 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
                <path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-display font-bold text-t1">StarTrack</span>
          </div>
          <div className="text-[12px] text-t3">© {new Date().getFullYear()} StarTrack. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
