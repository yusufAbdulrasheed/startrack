import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LockOpen, AlertCircle, KeyRound, Delete } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const KEYPAD_MAX = 6;

export function Login() {
  const navigate = useNavigate();
  const { login, tillLogin } = useSession();
  const [tab, setTab] = useState<"account" | "till">("account");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessCode, setBusinessCode] = useState(() => localStorage.getItem("startrack.tillCode") || "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (tab === "account") {
        await login(email.trim(), password);
        navigate("/app/dashboard");
      } else {
        await tillLogin(businessCode.trim(), pin);
        // Remember the code on this device — staff only type their PIN next time.
        localStorage.setItem("startrack.tillCode", businessCode.trim().toUpperCase());
        navigate("/app/pos");
      }
    } catch (err: any) {
      setError(err.message || "Could not sign in");
      if (tab === "till") setPin("");
    } finally {
      setBusy(false);
    }
  }

  function pressDigit(d: string) {
    setError("");
    setPin((p) => (p.length < KEYPAD_MAX ? p + d : p));
  }

  const inputCls =
    "w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer";

  return (
    <div className="h-full flex items-center justify-center bg-canvas relative overflow-hidden">
      <div className="absolute top-5 right-5"><ThemeToggle /></div>
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{ backgroundImage: "radial-gradient(circle, var(--st-border-2) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />
      <div className="relative w-[400px] max-w-[92vw] rounded-3xl bg-surface border border-line-2 shadow-e2 p-10 text-center animate-fade-up">
        <Link to="/" className="inline-flex w-16 h-16 rounded-2xl bg-primary shadow-brand items-center justify-center mb-5">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
            <path d="M4 8h24M4 16h15M4 24h19" stroke="white" strokeWidth="2.3" strokeLinecap="round" />
            <circle cx="26" cy="24" r="4.5" fill="white" opacity=".92" />
            <path d="M24.2 24l1.2 1.3L28 22.4" stroke="var(--st-brand-700)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-t1">Welcome back</h1>
        <p className="text-[13px] text-t3 mt-1 mb-6">Sign in to your business</p>

        {/* Mode tabs */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-ctl bg-surface-2 border border-line mb-5">
          {([
            { k: "account", label: "Account" },
            { k: "till", label: "Staff PIN" },
          ] as const).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => { setTab(t.k); setError(""); setPin(""); }}
              className={cn(
                "h-9 rounded-lg text-[13px] font-semibold transition-colors",
                tab === t.k ? "bg-surface text-primary shadow-e1" : "text-t3 hover:text-t1"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-left px-3 py-2.5 mb-4 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 text-left">
          {tab === "account" ? (
            <>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className={inputCls} />
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className={inputCls} />
              <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
                <LockOpen className="w-4 h-4" /> {busy ? "Signing in…" : "Sign In"}
              </Button>
            </>
          ) : (
            <>
              <input
                required
                value={businessCode}
                onChange={(e) => setBusinessCode(e.target.value.toUpperCase())}
                placeholder="Business code (e.g. K7M2XQ)"
                maxLength={6}
                className={cn(inputCls, "font-mono tracking-[0.3em] text-center uppercase")}
              />

              {/* PIN dots */}
              <div className="flex justify-center gap-2.5 py-1">
                {Array.from({ length: KEYPAD_MAX }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "w-3.5 h-3.5 rounded-full border-2 transition-colors",
                      i < pin.length ? "bg-primary border-primary" : "border-line-2"
                    )}
                  />
                ))}
              </div>

              {/* Numeric keypad */}
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pressDigit(d)}
                    className="h-12 rounded-ctl bg-surface-2 border border-line-2 text-[17px] font-bold text-t1 hover:bg-surface-3 active:scale-95 transition-all"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setError(""); setPin(""); }}
                  className="h-12 rounded-ctl bg-surface-2 border border-line-2 text-[11px] font-bold uppercase tracking-wide text-t3 hover:bg-surface-3 active:scale-95 transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => pressDigit("0")}
                  className="h-12 rounded-ctl bg-surface-2 border border-line-2 text-[17px] font-bold text-t1 hover:bg-surface-3 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => { setError(""); setPin((p) => p.slice(0, -1)); }}
                  className="h-12 rounded-ctl bg-surface-2 border border-line-2 flex items-center justify-center text-t3 hover:bg-surface-3 active:scale-95 transition-all"
                  aria-label="Backspace"
                >
                  <Delete className="w-[18px] h-[18px]" />
                </button>
              </div>

              <Button type="submit" size="lg" className="w-full mt-2" disabled={busy || pin.length < 4}>
                <KeyRound className="w-4 h-4" /> {busy ? "Signing in…" : "Sign in with PIN"}
              </Button>
              <p className="text-[11px] text-t4 text-center">Ask your manager for the business code and your PIN.</p>
            </>
          )}
        </form>

        <div className="mt-6 text-[13px] text-t3">
          New to StarTrack?{" "}
          <Link to="/register" className="text-primary font-semibold hover:underline">Create your business</Link>
        </div>

        <p className="text-[11px] text-t4 mt-6 font-mono">StarTrack · Business OS</p>
      </div>
    </div>
  );
}
