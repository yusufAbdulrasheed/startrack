import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LockOpen, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";

export function Login() {
  const navigate = useNavigate();
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-canvas relative overflow-hidden">
      <div className="absolute top-5 right-5"><ThemeToggle /></div>
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{ backgroundImage: "radial-gradient(circle, var(--st-border-2) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />
      <div className="relative w-[400px] max-w-[92vw] rounded-3xl bg-surface border border-line-2 shadow-e2 p-10 text-center animate-fade-up">
        <Link to="/" className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-brand items-center justify-center mb-5">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
            <path d="M4 8h24M4 16h15M4 24h19" stroke="white" strokeWidth="2.3" strokeLinecap="round" />
            <circle cx="26" cy="24" r="4.5" fill="white" opacity=".92" />
            <path d="M24.2 24l1.2 1.3L28 22.4" stroke="var(--st-brand-700)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-t1">Welcome back</h1>
        <p className="text-[13px] text-t3 mt-1 mb-8">Sign in to your business</p>

        {error && (
          <div className="flex items-center gap-2 text-left px-3 py-2.5 mb-4 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3 text-left">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
          />
          <Button type="submit" size="lg" className="w-full mt-2" disabled={busy}>
            <LockOpen className="w-4 h-4" /> {busy ? "Signing in…" : "Sign In"}
          </Button>
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
