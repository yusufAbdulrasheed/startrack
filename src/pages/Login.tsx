import { useNavigate } from "react-router-dom";
import { LockOpen } from "lucide-react";

export function Login() {
  const navigate = useNavigate();
  return (
    <div className="h-full flex items-center justify-center bg-canvas relative overflow-hidden">
      {/* backdrop texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{ backgroundImage: "radial-gradient(circle, var(--st-border-2) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
      />
      <div className="relative w-[400px] max-w-[92vw] rounded-3xl bg-surface border border-line-2 shadow-e2 p-10 text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-brand items-center justify-center mb-5">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
            <path d="M4 8h24M4 16h15M4 24h19" stroke="white" strokeWidth="2.3" strokeLinecap="round" />
            <circle cx="26" cy="24" r="4.5" fill="white" opacity=".92" />
            <path d="M24.2 24l1.2 1.3L28 22.4" stroke="var(--st-brand-700)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-t1">StarTrack</h1>
        <p className="text-[13px] text-t3 mt-1 mb-8">Sign in to your business</p>

        <div className="space-y-3 text-left">
          <input
            type="email"
            placeholder="Email address"
            className="w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full h-11 px-4 rounded-ctl bg-surface-2 border border-line-2 text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
          />
        </div>

        <button
          onClick={() => navigate("/app/dashboard")}
          className="mt-5 w-full h-11 rounded-ctl bg-gradient-to-r from-brand-700 to-brand-500 text-white text-[14px] font-bold shadow-brand hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          <LockOpen className="w-4 h-4" />
          Sign In
        </button>

        <button
          onClick={() => navigate("/app/dashboard")}
          className="mt-3 w-full h-11 rounded-ctl border border-line-2 text-[13px] font-semibold text-t2 hover:bg-surface-3 transition"
        >
          Try the demo — no signup
        </button>

        <p className="text-[11px] text-t4 mt-6 font-mono">StarTrack · Phase 0 shell</p>
      </div>
    </div>
  );
}
