import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Store, Pill, UtensilsCrossed, Shirt, MonitorSmartphone, Hotel, Scissors, Croissant, Wrench, Package,
  Ruler, Beer, ArrowRight, ArrowLeft, Check, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const TYPES = [
  { key: "retail", label: "Supermarket / Retail", icon: Store },
  { key: "pharmacy", label: "Pharmacy", icon: Pill },
  { key: "restaurant", label: "Restaurant / Eatery", icon: UtensilsCrossed },
  { key: "fashion", label: "Fashion / Boutique", icon: Shirt },
  { key: "tailoring", label: "Tailoring / Fashion Design", icon: Ruler },
  { key: "electronics", label: "Electronics", icon: MonitorSmartphone },
  { key: "hotel", label: "Hotel / Guest House", icon: Hotel },
  { key: "salon", label: "Salon / Beauty", icon: Scissors },
  { key: "bakery", label: "Bakery", icon: Croissant },
  { key: "bar", label: "Bar / Lounge", icon: Beer },
  { key: "services", label: "General Services", icon: Wrench },
  { key: "other", label: "Something else", icon: Package },
];

const CURRENCIES = ["₦", "$", "£", "€", "GH₵", "KSh"];

export function Register() {
  const navigate = useNavigate();
  const { register } = useSession();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("retail");
  const [branchName, setBranchName] = useState("Main Branch");
  const [currency, setCurrency] = useState("₦");

  const canNext1 = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  const canNext2 = businessName.trim().length >= 2 && businessType;

  async function finish() {
    setError("");
    setBusy(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, businessName: businessName.trim(), businessType, currency, branchName: branchName.trim() || "Main Branch" });
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not create your business");
      if (err.code === "email_taken") setStep(1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-canvas relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 st-grid-bg opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      {/* header */}
      <div className="relative flex items-center justify-between px-6 h-16">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-brand flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5"><path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
          <span className="font-display font-extrabold text-[17px] text-t1">StarTrack</span>
        </Link>
        <ThemeToggle />
      </div>

      <div className="relative flex-1 flex items-center justify-center p-5">
        <div className="w-full max-w-lg">
          {/* progress */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div className={cn("h-full bg-gradient-to-r from-brand-700 to-brand-500 transition-all duration-500", step >= s ? "w-full" : "w-0")} />
              </div>
            ))}
          </div>

          <div className="bg-surface border border-line-2 rounded-3xl shadow-e2 p-8 animate-fade-up">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 mb-5 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* STEP 1 — account */}
            {step === 1 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">Step 1 of 3</div>
                <h1 className="font-display text-xl font-extrabold text-t1">Let's create your account</h1>
                <p className="text-[13px] text-t3 mt-1 mb-6">This is your personal login — you'll manage everything from here.</p>
                <div className="space-y-3">
                  <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Isaac Owosuhi" className={inputCls} /></Field>
                  <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} /></Field>
                  <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className={inputCls} /></Field>
                </div>
                <Button size="lg" className="w-full mt-6" disabled={!canNext1} onClick={() => setStep(2)}>
                  Continue <ArrowRight className="w-4 h-4" />
                </Button>
                <p className="text-center text-[13px] text-t3 mt-4">
                  Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link>
                </p>
              </div>
            )}

            {/* STEP 2 — business */}
            {step === 2 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">Step 2 of 3</div>
                <h1 className="font-display text-xl font-extrabold text-t1">Tell us about your business</h1>
                <p className="text-[13px] text-t3 mt-1 mb-6">Pick the type that fits best — StarTrack will shape itself around it.</p>
                <Field label="Business name"><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Tado Foods" className={inputCls} /></Field>
                <div className="text-[11px] font-bold uppercase tracking-wide text-t3 mt-5 mb-2">Business type</div>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {TYPES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setBusinessType(t.key)}
                      className={cn(
                        "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all",
                        businessType === t.key ? "border-brand-500 bg-primary-soft" : "border-line hover:border-brand-300 hover:bg-surface-2"
                      )}
                    >
                      <span className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", businessType === t.key ? "bg-primary text-white" : "bg-surface-3 text-t3")}>
                        <t.icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className={cn("text-[12px] font-semibold leading-tight", businessType === t.key ? "text-primary" : "text-t2")}>{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-6">
                  <Button variant="secondary" size="lg" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /></Button>
                  <Button size="lg" className="flex-1" disabled={!canNext2} onClick={() => setStep(3)}>Continue <ArrowRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}

            {/* STEP 3 — branch + currency */}
            {step === 3 && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">Step 3 of 3</div>
                <h1 className="font-display text-xl font-extrabold text-t1">Almost there</h1>
                <p className="text-[13px] text-t3 mt-1 mb-6">Set up your first location. You can add more branches anytime.</p>
                <Field label="First branch / location"><input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Main Branch" className={inputCls} /></Field>
                <div className="text-[11px] font-bold uppercase tracking-wide text-t3 mt-5 mb-2">Currency</div>
                <div className="flex flex-wrap gap-2">
                  {CURRENCIES.map((c) => (
                    <button key={c} onClick={() => setCurrency(c)} className={cn("px-4 h-11 rounded-ctl border font-semibold text-[14px] transition-colors", currency === c ? "border-brand-500 bg-primary-soft text-primary" : "border-line text-t2 hover:border-brand-300")}>{c}</button>
                  ))}
                </div>
                <div className="flex gap-2 mt-8">
                  <Button variant="secondary" size="lg" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4" /></Button>
                  <Button variant="success" size="lg" className="flex-1" disabled={busy} onClick={finish}>
                    <Check className="w-4 h-4" /> {busy ? "Creating your business…" : "Create my business"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wide text-t3 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
