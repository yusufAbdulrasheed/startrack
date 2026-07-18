import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CreditCard,
  Menu,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  Store,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";

// One-click sandbox: seeded business, no signup, resets in 24h.
function DemoButton({ size = "sm", children, className }: { size?: "sm" | "md" | "lg"; children: React.ReactNode; className?: string }) {
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
      <Button size={size} className={className} onClick={go} disabled={busy}>
        {busy ? "Setting up your shop…" : children}
      </Button>
      {error && <span className="text-[11px] font-semibold text-danger">{error}</span>}
    </span>
  );
}

const FEATURES = [
  { icon: ScanLine, title: "Lightning POS", body: "Scan or search, take payment, print or WhatsApp a receipt — in under three taps. Built for busy counters." },
  { icon: Boxes, title: "Inventory that stays honest", body: "Every movement is an auditable ledger entry. Stock-ins, transfers, returns — nothing silently drifts." },
  { icon: BarChart3, title: "Dashboards that don't lag", body: "Pre-computed metrics mean your numbers load instantly, whether you have 3 sales or 30,000." },
  { icon: WifiOff, title: "Works offline", body: "Network drops? Keep selling. Sales queue safely and sync the moment you're back online." },
  { icon: ShieldCheck, title: "Real separation of power", body: "Staff never see cost or profit. Every sensitive action is logged. Enforced on the server, not just hidden." },
  { icon: Users, title: "Many businesses, one login", body: "Run a shop and a pharmacy from the same account. Switch between them like profiles." },
];

const VERTICALS = ["Supermarket", "Pharmacy", "Restaurant", "Fashion", "Electronics", "Window Blinds", "Hotel", "Salon", "Bakery", "Bar", "+ your business"];

const STEPS = [
  { n: "01", title: "Register your business", body: "Name it, pick your business type, set your currency. 60 seconds." },
  { n: "02", title: "Add products or import", body: "Type them in, scan them, upload a CSV, or start with demo data." },
  { n: "03", title: "Invite your team", body: "Give each staff a PIN and a role. They log in at the till and start selling." },
  { n: "04", title: "Watch it from anywhere", body: "Your dashboard, live, on your phone — even when you're not in the shop." },
];

const PLANS = [
  { name: "Starter", price: "Free", tag: "For a single shop finding its feet", features: ["1 branch", "2 staff", "Unlimited sales", "30-day history"], cta: "Start free", highlight: false },
  { name: "Growth", price: "₦9,500", per: "/mo", tag: "For a growing business", features: ["Up to 3 branches", "10 staff", "Full dashboards", "WhatsApp receipts", "1-year history"], cta: "Start Growth", highlight: true },
  { name: "Pro", price: "₦24,000", per: "/mo", tag: "For multi-branch operators", features: ["Unlimited branches", "Unlimited staff", "Finance dashboard", "Exports & audit log", "Priority support"], cta: "Talk to us", highlight: false },
];

function Nav() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-surface/70 border-b border-line">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-brand flex items-center justify-center">
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
          <a href="#verticals" className="hover:text-t1 transition-colors">Businesses</a>
          <a href="#pricing" className="hover:text-t1 transition-colors">Pricing</a>
        </nav>
        <div className="ml-auto md:ml-0 flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <DemoButton size="sm">Try the demo</DemoButton>
          <button className="md:hidden w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t2">
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 st-grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-brand-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-5 pt-20 pb-16 text-center">
        <div className="inline-flex animate-fade-up">
          <Badge tone="brand" className="px-3 py-1 text-[12px]">
            <Zap className="w-3.5 h-3.5" /> One platform for every kind of business
          </Badge>
        </div>
        <h1 className="mt-6 font-display font-extrabold tracking-tight text-t1 text-[clamp(2.2rem,6vw,4rem)] leading-[1.05] animate-fade-up" style={{ animationDelay: "60ms" }}>
          Run your business,<br />
          <span className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-transparent">not your spreadsheets.</span>
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-[15px] md:text-[16px] leading-relaxed text-t2 animate-fade-up" style={{ animationDelay: "120ms" }}>
          Sell, track stock, manage staff, and watch your money move — from one clean app that
          works the way <em>your</em> business works. Supermarket, pharmacy, restaurant, or hotel.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap animate-fade-up" style={{ animationDelay: "180ms" }}>
          <DemoButton size="lg" className="shadow-brand">
            <>Try the live demo <ArrowRight className="w-4 h-4" /></>
          </DemoButton>
          <Button variant="outline" size="lg">
            <PlayCircle className="w-4 h-4" /> Watch 2-min tour
          </Button>
        </div>
        <div className="mt-4 text-[12px] text-t3 animate-fade-up" style={{ animationDelay: "220ms" }}>
          No card required · Free forever for one shop
        </div>

        {/* Product mock */}
        <div className="mt-14 relative animate-fade-up" style={{ animationDelay: "260ms" }}>
          <div className="mx-auto max-w-4xl rounded-2xl border border-line-2 bg-surface shadow-e2 overflow-hidden">
            <div className="h-9 bg-surface-2 border-b border-line flex items-center gap-1.5 px-4">
              <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
              <span className="ml-3 text-[11px] font-mono text-t4">app.startrack.africa/dashboard</span>
            </div>
            <div className="grid grid-cols-4 gap-3 p-4 bg-canvas">
              {[
                { l: "Today's Revenue", v: "₦248,500", c: "text-t1" },
                { l: "Transactions", v: "37", c: "text-t1" },
                { l: "Profit", v: "₦61,300", c: "text-success" },
                { l: "Low Stock", v: "4", c: "text-warning" },
              ].map((k) => (
                <div key={k.l} className="bg-surface border border-line rounded-xl p-3 text-left">
                  <div className={`text-[18px] font-bold font-mono ${k.c}`}>{k.v}</div>
                  <div className="text-[10px] text-t3 mt-0.5">{k.l}</div>
                </div>
              ))}
              <div className="col-span-4 bg-surface border border-line rounded-xl p-4 h-40 flex items-end gap-2">
                {[38, 62, 48, 75, 58, 88, 70, 82, 66, 94, 78, 90].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-700 to-brand-400 opacity-85" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <div className="min-h-full bg-canvas overflow-x-hidden">
      <Nav />
      <Hero />

      {/* Trust bar */}
      <section className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-6 flex items-center justify-center gap-x-10 gap-y-3 flex-wrap text-t3">
          <span className="text-[12px] font-semibold uppercase tracking-wider">Trusted by shops running on</span>
          {["Cash", "POS", "Transfer", "Offline", "Multi-branch"].map((t) => (
            <span key={t} className="text-[13px] font-bold text-t2">{t}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <Badge tone="brand">Everything in one place</Badge>
          <h2 className="mt-4 font-display font-extrabold text-t1 text-[clamp(1.7rem,4vw,2.5rem)] tracking-tight">
            The whole shop, handled.
          </h2>
          <p className="mt-3 text-[15px] text-t2">
            Stop stitching together WhatsApp, notebooks and a calculator. StarTrack is the one place your business lives.
          </p>
        </div>
        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="group bg-surface border border-line rounded-card p-6 transition-all duration-200 hover:border-brand-300 hover:shadow-e2 hover:-translate-y-1">
              <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                <f.icon className="w-[22px] h-[22px]" />
              </div>
              <h3 className="mt-4 font-bold text-[15px] text-t1">{f.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-t3">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Badge tone="success">Live in 10 minutes</Badge>
            <h2 className="mt-4 font-display font-extrabold text-t1 text-[clamp(1.7rem,4vw,2.5rem)] tracking-tight">
              From sign-up to first sale, fast.
            </h2>
          </div>
          <div className="mt-14 grid md:grid-cols-4 gap-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <div className="font-display font-extrabold text-[40px] text-brand-200 leading-none">{s.n}</div>
                <h3 className="mt-2 font-bold text-[15px] text-t1">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-t3">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Verticals */}
      <section id="verticals" className="max-w-6xl mx-auto px-5 py-24 text-center">
        <Badge tone="brand"><Store className="w-3.5 h-3.5" /> One engine, every vertical</Badge>
        <h2 className="mt-4 font-display font-extrabold text-t1 text-[clamp(1.7rem,4vw,2.5rem)] tracking-tight">
          Built for the way <span className="text-primary">your</span> business runs.
        </h2>
        <p className="mt-3 max-w-xl mx-auto text-[15px] text-t2">
          A pharmacy tracks expiry. A restaurant tracks recipes. A hotel tracks rooms, kitchen and bar.
          Pick your type — StarTrack reshapes around it.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-2.5">
          {VERTICALS.map((v) => (
            <span key={v} className="px-4 py-2 rounded-full border border-line-2 bg-surface text-[13px] font-semibold text-t2 hover:border-brand-400 hover:text-primary transition-colors cursor-default">
              {v}
            </span>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Badge tone="brand"><CreditCard className="w-3.5 h-3.5" /> Simple pricing</Badge>
            <h2 className="mt-4 font-display font-extrabold text-t1 text-[clamp(1.7rem,4vw,2.5rem)] tracking-tight">
              Start free. Grow when you're ready.
            </h2>
          </div>
          <div className="mt-14 grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={
                  "relative rounded-2xl p-6 border " +
                  (p.highlight
                    ? "border-brand-500 bg-gradient-to-b from-primary-softer to-surface shadow-e2 md:-translate-y-3"
                    : "border-line bg-surface")
                }
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-brand-700 to-brand-500 text-white text-[11px] font-bold shadow-brand">
                    Most popular
                  </span>
                )}
                <div className="font-bold text-[15px] text-t1">{p.name}</div>
                <div className="text-[12px] text-t3 mt-0.5 h-8">{p.tag}</div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="font-display font-extrabold text-[32px] text-t1">{p.price}</span>
                  {p.per && <span className="text-[13px] text-t3 mb-1.5">{p.per}</span>}
                </div>
                <Link to="/register" className="block mt-5">
                  <Button variant={p.highlight ? "primary" : "outline"} className="w-full">{p.cta}</Button>
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
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-5 py-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 to-brand-600 p-12 md:p-16 text-center">
          <div className="absolute inset-0 st-grid-bg opacity-10" />
          <div className="relative">
            <h2 className="font-display font-extrabold text-white text-[clamp(1.8rem,4vw,2.6rem)] tracking-tight">
              Your business deserves better than a notebook.
            </h2>
            <p className="mt-3 text-white/80 text-[15px] max-w-lg mx-auto">
              Try the live demo right now — no sign-up, no card. Click around a real shop.
            </p>
            <div className="mt-8 flex justify-center gap-3 flex-wrap">
              <Link to="/register">
                <Button size="lg" className="bg-white !text-brand-700 shadow-lg hover:bg-white/90">
                  Open the demo <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-700 to-brand-500 flex items-center justify-center">
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
