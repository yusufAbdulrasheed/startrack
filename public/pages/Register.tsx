import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Check, Search, Rocket, Store, MapPin, User,
  ShoppingBasket, Pill, Wine, Scissors, Blinds, Croissant, Smartphone, Snowflake,
  Shirt, Wrench, Hammer, BedDouble, UtensilsCrossed, Droplets, Egg, Fuel,
  Sparkles, Dumbbell, Sprout, Sofa, Printer, Fish, Car, Package,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { TYPE_META } from "@/lib/businessTypes";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, any> = {
  retail: ShoppingBasket, pharmacy: Pill, bar: Wine, tailoring: Scissors, blinds: Blinds,
  bakery: Croissant, electronics: Smartphone, coldroom: Snowflake, laundry: Shirt,
  autorepair: Wrench, buildingmaterials: Hammer, hotel: BedDouble, restaurant: UtensilsCrossed,
  water: Droplets, poultry: Egg, filling: Fuel, salon: Sparkles, gym: Dumbbell,
  agro: Sprout, furniture: Sofa, printing: Printer, fishfarm: Fish, carwash: Car,
  services: Package, other: Store,
};

const STEPS = [
  { n: 1, label: "Your business", icon: Store },
  { n: 2, label: "About you", icon: User },
  { n: 3, label: "First branch", icon: MapPin },
];

export function Register() {
  const navigate = useNavigate();
  const { register } = useSession();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  const [form, setForm] = useState({
    businessName: "", tradingName: "", businessType: "", taxId: "", employees: "",
    name: "", email: "", password: "",
    branchName: "Main Branch", currency: "₦",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const types = useMemo(() => {
    const all = Object.entries(TYPE_META).map(([key, m]) => ({ key, ...m }));
    const term = q.trim().toLowerCase();
    return term ? all.filter((t) => t.label.toLowerCase().includes(term)) : all;
  }, [q]);

  const chosen = form.businessType ? TYPE_META[form.businessType] : null;

  const canAdvance =
    step === 1 ? form.businessName.trim().length >= 2 && !!form.businessType
    : step === 2 ? form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 6
    : form.branchName.trim().length >= 1;

  async function submit() {
    setBusy(true); setError("");
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        businessName: form.businessName.trim(),
        businessType: form.businessType,
        tradingName: form.tradingName.trim(),
        taxId: form.taxId.trim(),
        employees: Number(form.employees) || 0,
        branchName: form.branchName.trim(),
        currency: form.currency,
      } as any);
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not create your account");
      setBusy(false);
      setStep(2); // credentials are the usual culprit
    }
  }

  return (
    <div className="min-h-full flex bg-canvas">
      {/* Left: the pitch. Fixed dark panel, the one place the app goes bold. */}
      <aside className="hidden lg:flex w-[42%] max-w-[560px] shrink-0 flex-col justify-between p-10 relative overflow-hidden" style={{ background: "var(--st-ink)" }}>
        {/* A slow, quiet field of light — motion that doesn't ask for attention. */}
        <div aria-hidden className="absolute inset-0 opacity-70">
          <div className="absolute -top-32 -left-24 w-[420px] h-[420px] rounded-full blur-3xl animate-drift" style={{ background: "radial-gradient(circle, rgba(0,88,190,.55), transparent 70%)" }} />
          <div className="absolute bottom-[-140px] right-[-80px] w-[380px] h-[380px] rounded-full blur-3xl animate-drift-slow" style={{ background: "radial-gradient(circle, rgba(33,112,228,.4), transparent 70%)" }} />
        </div>

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
              <Rocket className="w-[18px] h-[18px] text-white" />
            </span>
            <div>
              <div className="font-display font-bold text-[15px] text-white leading-none">StarTrack</div>
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-white/50 mt-1">Business OS</div>
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display font-extrabold text-white text-[38px] leading-[1.05] tracking-tight text-balance">
            Launch your<br />business.
          </h1>
          <p className="text-white/60 text-[14px] leading-relaxed mt-4 max-w-[380px]">
            One engine, many trades. Set up your till, stock, staff and reporting in the next three minutes — under your own name.
          </p>

          <div className="mt-8 space-y-3">
            {STEPS.map((s) => {
              const done = step > s.n;
              const active = step === s.n;
              return (
                <div key={s.n} className="flex items-center gap-3">
                  <span className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 transition-all duration-300",
                    done ? "bg-white text-[color:var(--st-ink)]"
                      : active ? "bg-white/15 text-white ring-2 ring-white/40"
                      : "bg-white/5 text-white/40"
                  )}>
                    {done ? <Check className="w-4 h-4" /> : s.n}
                  </span>
                  <span className={cn("text-[13px] transition-colors", active ? "text-white font-semibold" : done ? "text-white/70" : "text-white/35")}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative text-white/40 text-[11px]">
          Free while we pilot · No card required
        </div>
      </aside>

      {/* Right: the form */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between px-6 lg:px-10 h-16 shrink-0">
          <span className="lg:hidden font-display font-bold text-[15px] text-t1">StarTrack</span>
          <div className="ml-auto text-[13px] text-t3">
            Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Sign in</Link>
          </div>
        </div>

        <div className="flex-1 flex items-start justify-center px-6 lg:px-10 pb-10">
          <div className="w-full max-w-[560px]">
            {/* Progress — thin, honest, no percentages invented */}
            <div className="flex items-center gap-2 mb-6">
              {STEPS.map((s) => (
                <span key={s.n} className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-500",
                  step >= s.n ? "bg-primary" : "bg-surface-3"
                )} />
              ))}
            </div>

            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-t4">Step {step} of 3</div>
              <h2 className="font-display font-extrabold text-t1 text-[26px] tracking-tight mt-1">
                {step === 1 ? "What kind of business?" : step === 2 ? "Who's the owner?" : "Where do you trade?"}
              </h2>
              <p className="text-[13px] text-t3 mt-1">
                {step === 1 ? "This shapes your whole app — the words, the categories, what's switched on."
                  : step === 2 ? "You'll sign in with this. Staff get their own PINs later."
                  : "Add more branches any time; transfers and per-branch reporting switch on at two."}
              </p>
            </div>

            <ErrorBanner message={error} />

            <div key={step} className="animate-fade-up">
              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Business name" hint="What customers call you">
                      <Input autoFocus value={form.businessName} onChange={(e) => set({ businessName: e.target.value })} placeholder="e.g. Tado Foods" />
                    </Field>
                    <Field label="Registered name" hint="Optional — for receipts and invoices">
                      <Input value={form.tradingName} onChange={(e) => set({ tradingName: e.target.value })} placeholder="e.g. Tado Foods Ltd" />
                    </Field>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[12px] font-semibold text-t2">Your trade</span>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-t4 pointer-events-none" />
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="Search 26 trades…"
                          className="h-8 w-44 pl-8 pr-2 rounded-ctl bg-surface-2 border border-line text-[12px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
                      {types.map((t) => {
                        const Icon = TYPE_ICON[t.key] || Store;
                        const on = form.businessType === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => set({ businessType: t.key })}
                            className={cn(
                              "group relative flex flex-col items-start gap-2 p-3 rounded-card border text-left transition-all duration-150",
                              on
                                ? "border-brand-500 bg-primary-softer shadow-brand -translate-y-0.5"
                                : "border-line bg-surface hover:border-brand-300 hover:-translate-y-0.5"
                            )}
                          >
                            <span className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                              on ? "bg-primary text-white" : "bg-surface-3 text-t3 group-hover:text-primary"
                            )}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className={cn("text-[12px] font-semibold leading-tight", on ? "text-primary" : "text-t1")}>
                              {t.label}
                            </span>
                            {on && (
                              <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                                <Check className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Shows the consequence of the choice, immediately. */}
                  {chosen && (
                    <div className="animate-fade-in rounded-card border border-line bg-surface-2 p-3.5">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-t4 mb-1.5">What you'll get</div>
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-t2">Your products will be called</span>
                        <span className="px-2 py-0.5 rounded-md bg-primary-soft text-primary font-semibold">{chosen.products}</span>
                        <span className="text-t2">and the till is your</span>
                        <span className="px-2 py-0.5 rounded-md bg-primary-soft text-primary font-semibold">{chosen.pos}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <Field label="Your name">
                    <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Isaac Owosuhi" />
                  </Field>
                  <Field label="Email">
                    <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@example.com" />
                  </Field>
                  <Field label="Password" hint="At least 6 characters">
                    <Input type="password" value={form.password} onChange={(e) => set({ password: e.target.value })} placeholder="••••••••" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Tax ID" hint="Optional">
                      <Input value={form.taxId} onChange={(e) => set({ taxId: e.target.value })} placeholder="Optional" />
                    </Field>
                    <Field label="Staff count" hint="Roughly — helps us size things">
                      <Input type="number" min="0" value={form.employees} onChange={(e) => set({ employees: e.target.value })} placeholder="e.g. 4" />
                    </Field>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Branch name">
                      <Input autoFocus value={form.branchName} onChange={(e) => set({ branchName: e.target.value })} placeholder="Main Branch" />
                    </Field>
                    <Field label="Currency">
                      <Input maxLength={4} value={form.currency} onChange={(e) => set({ currency: e.target.value })} />
                    </Field>
                  </div>

                  {/* The whole thing, read back before they commit. */}
                  <div className="rounded-card border border-line overflow-hidden">
                    <div className="px-4 py-2.5 bg-surface-2 border-b border-line text-[11px] font-bold uppercase tracking-wide text-t4">
                      Ready to launch
                    </div>
                    <dl className="divide-y divide-line">
                      {[
                        ["Business", form.businessName || "—"],
                        ["Trade", chosen?.label || "—"],
                        ["Owner", form.name || "—"],
                        ["Sign in as", form.email || "—"],
                        ["First branch", form.branchName || "—"],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-4 py-2.5">
                          <dt className="text-[12px] text-t3">{k}</dt>
                          <dd className="text-[13px] font-semibold text-t1 truncate max-w-[60%]">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-7">
              {step > 1 && (
                <Button variant="secondary" onClick={() => { setStep(step - 1); setError(""); }} disabled={busy}>
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button className="flex-1" disabled={!canAdvance} onClick={() => setStep(step + 1)}>
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button variant="success" className="flex-1" disabled={!canAdvance || busy} onClick={submit}>
                  <Rocket className="w-4 h-4" /> {busy ? "Setting things up…" : "Create my business"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
