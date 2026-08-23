import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, BarChart3, Boxes, Check, Menu, ScanLine, ShieldCheck, Users, WifiOff,
  Wallet, Receipt, UserCog, History, AlertTriangle,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/* Landing uses its own solid button styles on purpose — no gradients here. */
const btnSolid =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-ctl bg-brand-700 text-white hover:bg-brand-600 active:scale-[0.98] transition-all disabled:opacity-50";
const btnQuiet =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-ctl border border-line-2 text-t1 bg-surface hover:bg-surface-2 transition-all";

// One-click sandbox: seeded business, no signup, resets in 24h.
function DemoButton({ big = false, children }: { big?: boolean; children: React.ReactNode }) {
  const { demoLogin } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true);
    setError("");
    try {
      await demoLogin();
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not start the demo");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button className={cn(btnSolid, big ? "h-[52px] px-7 text-[15px]" : "h-9 px-4 text-[13px]")} onClick={go} disabled={busy}>
        {busy ? "Opening your demo shop…" : children}
      </button>
      {error && <span className="text-[11px] font-semibold text-danger">{error}</span>}
    </span>
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

const FEATURES = [
  { icon: ScanLine, title: "Sell in three taps", body: "Search or scan, take the money, hand over a printed or WhatsApp receipt. Your staff won't need training." },
  { icon: Boxes, title: "Stock that can't lie", body: "Every carton in and every sachet out is written down with who and when. When the count is off, you'll know exactly where." },
  { icon: WifiOff, title: "Network gone? Keep selling", body: "Sales save on the till and send themselves when the network returns. NEPA and bad data can't stop the queue." },
  { icon: ShieldCheck, title: "Staff see only their work", body: "Your prices, costs and profit stay yours. Staff log in with a PIN and see the till — nothing else. The server enforces it." },
  { icon: BarChart3, title: "The truth, every evening", body: "Revenue, profit after expenses, who sold what, what's running out — on your phone before you ask." },
  { icon: Users, title: "Customers worth keeping", body: "Every sale can build your customer book — who buys, how often, how much. Your best customers, known by name." },
];

const VERTICALS = ["Supermarket", "Pharmacy", "Restaurant", "Fashion", "Tailoring", "Electronics", "Window Blinds", "Salon", "Bakery", "Bar", "+ yours"];

const STEPS = [
  { n: "1", title: "Register", body: "Business name, type, currency. One minute, no card." },
  { n: "2", title: "Bring your products", body: "Type them, scan them, or import your Excel/Sheets file whole." },
  { n: "3", title: "Give your staff PINs", body: "Each person gets a PIN and a role. They sell; you stay in charge." },
  { n: "4", title: "Check your phone", body: "The day's numbers follow you — at home, in traffic, anywhere." },
];

const PLANS = [
  { name: "Starter", price: "Free", tag: "One shop finding its feet", features: ["1 branch", "2 staff", "Unlimited sales", "30-day history"], cta: "Start free", highlight: false },
  { name: "Growth", price: "₦9,500", per: "/mo", tag: "A business that's moving", features: ["Up to 3 branches", "10 staff", "All dashboard tabs", "WhatsApp receipts", "1-year history"], cta: "Start Growth", highlight: true },
  { name: "Pro", price: "₦24,000", per: "/mo", tag: "Multi-branch operators", features: ["Unlimited branches", "Unlimited staff", "Finance dashboard", "Exports & audit log", "Priority support"], cta: "Talk to us", highlight: false },
];

function Nav() {
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
        <nav className="hidden md:flex items-center gap-7 mx-auto text-[13px] font-medium text-t2">
          <a href="#features" className="hover:text-t1 transition-colors">Features</a>
          <a href="#how" className="hover:text-t1 transition-colors">How it works</a>
          <a href="#pricing" className="hover:text-t1 transition-colors">Pricing</a>
        </nav>
        <div className="ml-auto md:ml-0 flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="hidden sm:inline-flex h-9 px-4 items-center text-[13px] font-semibold text-t2 hover:text-t1 transition-colors">
            Sign in
          </Link>
          <DemoButton>Try the demo</DemoButton>
          <button className="md:hidden w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t2">
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Landing() {
  return (
    <div className="min-h-full bg-canvas overflow-x-hidden">
      <Nav />

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-5 pt-16 md:pt-24 pb-16 text-center">
        <h1 className="font-display font-extrabold tracking-tight text-t1 text-[clamp(2.8rem,8vw,5.2rem)] leading-[1.02]">
          Every kobo,<br />
          <span className="text-primary">accounted for.</span>
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-[16px] md:text-[17px] leading-relaxed text-t2">
          StarTrack runs your shop — the selling, the stock, the staff, the money —
          and tells you the truth about all of it, every single day.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <DemoButton big>
            <>See the demo shop <ArrowRight className="w-4 h-4" /></>
          </DemoButton>
          <Link to="/register" className={cn(btnQuiet, "h-[52px] px-7 text-[15px]")}>
            Create your business
          </Link>
        </div>
        <div className="mt-4 text-[13px] text-t3">
          No sign-up needed for the demo · Free while we pilot · Works on your phone
        </div>

        {/* The dashboard itself, tab by tab */}
        <div className="mt-14">
          <DashboardShow />
          <div className="mt-3 text-[12px] text-t4">This is the actual dashboard — six tabs, live numbers. Click through or just watch.</div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-display font-extrabold text-t1 text-[clamp(1.9rem,4.5vw,2.8rem)] tracking-tight">
              The whole shop, handled.
            </h2>
            <p className="mt-3 text-[15px] text-t2">
              Stop stitching together a notebook, WhatsApp and a calculator.
            </p>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
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

      {/* How it works + verticals */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-display font-extrabold text-t1 text-[clamp(1.9rem,4.5vw,2.8rem)] tracking-tight">
            Selling before your tea gets cold.
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-4 gap-6">
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="w-9 h-9 rounded-full bg-brand-700 text-white font-bold text-[15px] flex items-center justify-center">{s.n}</div>
              <h3 className="mt-3 font-bold text-[15px] text-t1">{s.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-t3">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-t3 mb-4">Shaped to your kind of business</p>
          <div className="flex flex-wrap justify-center gap-2.5">
            {VERTICALS.map((v) => (
              <span key={v} className="px-4 py-2 rounded-full border border-line-2 bg-surface text-[13px] font-semibold text-t2">
                {v}
              </span>
            ))}
          </div>
          <p className="mt-4 max-w-lg mx-auto text-[13px] text-t3">
            A pharmacy tracks expiry dates. A tailor prices by measurement. A supermarket lives on the barcode scanner.
            Pick your type and StarTrack sets itself up that way.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="font-display font-extrabold text-t1 text-[clamp(1.9rem,4.5vw,2.8rem)] tracking-tight">
              Start free. Grow when you're ready.
            </h2>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={cn(
                  "relative rounded-2xl p-6 border bg-canvas",
                  p.highlight ? "border-brand-500 shadow-e2 md:-translate-y-3" : "border-line"
                )}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-brand-700 text-white text-[11px] font-bold">
                    Most popular
                  </span>
                )}
                <div className="font-bold text-[15px] text-t1">{p.name}</div>
                <div className="text-[12px] text-t3 mt-0.5 h-8">{p.tag}</div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display font-extrabold text-[32px] text-t1">{p.price}</span>
                  {p.per && <span className="text-[13px] text-t3 mb-1.5">{p.per}</span>}
                </div>
                <Link to="/register" className={cn(p.highlight ? btnSolid : btnQuiet, "w-full h-10 mt-5 text-[13px]")}>
                  {p.cta}
                </Link>
                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-t2">
                      <span className="w-4 h-4 rounded-full bg-success-soft text-success flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-[13px] text-t3">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-warning" />
            While we pilot, everything is free — pricing starts later, and pilot businesses keep a discount.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-20">
        <div className="rounded-3xl bg-brand-800 p-12 md:p-16 text-center">
          <h2 className="font-display font-extrabold text-white text-[clamp(2rem,4.5vw,2.8rem)] tracking-tight">
            Your business deserves better<br className="hidden md:block" /> than a notebook.
          </h2>
          <p className="mt-3 text-white/75 text-[15px] max-w-lg mx-auto">
            Open the demo shop right now — no sign-up, no card. Sell something. Void it. Approve a return. See if it fits your hand.
          </p>
          <div className="mt-8 flex justify-center">
            <DemoButton big>
              <>Open the demo shop <ArrowRight className="w-4 h-4" /></>
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
            <span className="text-[12px] text-t4">· Business OS</span>
          </div>
          <div className="text-[12px] text-t3">© {new Date().getFullYear()} StarTrack. Built for African businesses.</div>
        </div>
      </footer>
    </div>
  );
}
