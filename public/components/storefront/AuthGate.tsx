import { useState } from "react";
import { ArrowLeft, Bell, ClipboardList, Lock, ShoppingBag, Zap } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { Gate, ShopApi, Shopper } from "@/lib/shop";
import { Button, Field, Notice, PasswordInput, TextInput } from "./bits";
import { useTheme } from "./context";

type Mode = "register" | "login" | "forgot" | "reset";

/**
 * What a stranger sees: who the shop is, and a way in. Nothing else on the
 * page is reachable without an account — the server enforces it; this screen
 * is just the friendly front door.
 */
export function AuthGate({ gate, api, onAuthed }: { gate: Gate; api: ShopApi; onAuthed: (token: string, shopper: Shopper) => void }) {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>("register");
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", code: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const switchTo = (m: Mode) => { setMode(m); setError(""); setInfo(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    try {
      if (mode === "register") {
        const r = await api.register({ name: f.name, email: f.email, phone: f.phone, password: f.password });
        onAuthed(r.token, r.shopper);
      } else if (mode === "login") {
        const r = await api.login({ email: f.email, password: f.password });
        onAuthed(r.token, r.shopper);
      } else if (mode === "forgot") {
        const r = await api.forgot(f.email);
        setInfo(r.devCode ? `${r.message} (Development: your code is ${r.devCode}.)` : r.message);
        setMode("reset");
      } else {
        const r = await api.reset({ email: f.email, code: f.code, password: f.password });
        onAuthed(r.token, r.shopper);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const heading = { register: "Create your account", login: "Welcome back", forgot: "Forgot your password?", reset: "Choose a new password" }[mode];
  const sub = {
    register: `Join ${gate.name} to browse the shop, order and track your orders.`,
    login: `Sign in to continue to ${gate.name}.`,
    forgot: "Enter your email and we'll send you a 6-digit code.",
    reset: "Enter the code we emailed you and a new password.",
  }[mode];

  const perks = [
    { icon: ShoppingBag, text: "Browse everything in stock, with prices" },
    { icon: Zap, text: "Order in a few taps — pickup or delivery" },
    { icon: ClipboardList, text: "Track every order from placed to delivered" },
    { icon: Bell, text: "Get updates as the shop works on your order" },
  ];

  return (
    <div className="min-h-full w-full flex flex-col lg:flex-row" style={{ background: t.bg, color: t.text }}>
      {gate.announcement && (
        <div className="lg:hidden px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: t.dark ? "#1b2150" : "#111827", color: "#fff" }}>{gate.announcement}</div>
      )}

      {/* Who they're about to join */}
      <section
        className="relative overflow-hidden lg:w-[46%] lg:min-h-screen px-6 py-10 lg:px-14 lg:py-16 flex flex-col justify-between"
        style={{
          background: gate.heroUrl
            ? `linear-gradient(180deg, rgba(8,10,30,0.55), rgba(8,10,30,0.85)), url(${gate.heroUrl}) center/cover`
            : `linear-gradient(135deg, ${t.accent}, color-mix(in srgb, ${t.accent} 55%, #000))`,
          color: gate.heroUrl ? "#fff" : t.onAccent,
        }}
      >
        {!gate.heroUrl && (<><div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/10" /><div className="absolute -left-20 bottom-0 w-72 h-72 rounded-full bg-white/10" /></>)}
        <div className="relative flex items-center gap-3">
          {gate.logoUrl
            ? <img src={gate.logoUrl} alt="" referrerPolicy="no-referrer" className="w-12 h-12 rounded-2xl object-cover bg-white" />
            : <span className="w-12 h-12 rounded-2xl grid place-items-center font-extrabold text-[20px] bg-white" style={{ color: t.accent }}>{gate.name.slice(0, 1).toUpperCase()}</span>}
          <span className="font-extrabold text-[20px] tracking-tight">{gate.name}</span>
        </div>

        <div className="relative my-10 lg:my-0 max-w-[460px]">
          <h1 className="text-[34px] lg:text-[48px] font-extrabold leading-[1.05] tracking-[-0.03em]">{gate.headline || `Shop at ${gate.name}`}</h1>
          {gate.tagline && <p className="mt-4 text-[16px] lg:text-[18px] leading-relaxed opacity-90">{gate.tagline}</p>}
          <ul className="hidden lg:grid mt-9 gap-3.5">
            {perks.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-[15px] font-medium">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/15"><p.icon className="w-[18px] h-[18px]" /></span>{p.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative hidden lg:flex items-center gap-2 text-[12.5px] opacity-75"><Lock className="w-3.5 h-3.5" /> Your details are shared only with {gate.name}.</p>
      </section>

      {/* The form */}
      <section className="flex-1 grid place-items-center px-5 py-10 lg:py-16">
        <div className="w-full max-w-[440px]">
          {(mode === "forgot" || mode === "reset") && (
            <button type="button" onClick={() => switchTo("login")} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold mb-5" style={{ color: t.muted }}>
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </button>
          )}
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em]">{heading}</h2>
          <p className="mt-1.5 text-[15px]" style={{ color: t.muted }}>{sub}</p>

          {(mode === "register" || mode === "login") && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-full mt-6" style={{ background: t.soft }} role="tablist">
              {(["register", "login"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => switchTo(m)} className="h-10 rounded-full text-[14px] font-bold transition-colors"
                  style={mode === m ? { background: t.surface, color: t.text, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" } : { color: t.muted }}>
                  {m === "register" ? "Create account" : "Sign in"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {error && <Notice>{error}</Notice>}
            {info && <Notice tone="info">{info}</Notice>}

            {mode === "register" && (
              <>
                <Field label="Your name"><TextInput value={f.name} onChange={set("name")} autoComplete="name" required placeholder="e.g. Chidi Okafor" /></Field>
                <Field label="Phone number" hint="So the shop can reach you about your order."><TextInput value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" required placeholder="0803 123 4567" /></Field>
              </>
            )}
            <Field label="Email"><TextInput value={f.email} onChange={set("email")} type="email" autoComplete="email" required placeholder="you@example.com" /></Field>
            {mode === "reset" && <Field label="6-digit code"><TextInput value={f.code} onChange={set("code")} inputMode="numeric" maxLength={6} autoComplete="one-time-code" required placeholder="123456" /></Field>}
            {mode !== "forgot" && (
              <Field label={mode === "reset" ? "New password" : "Password"} hint={mode !== "login" ? "At least 8 characters." : undefined}>
                <PasswordInput value={f.password} onChange={set("password")} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
              </Field>
            )}

            <Button type="submit" full disabled={busy}>
              {busy ? "Please wait…" : { register: "Create account & continue", login: "Sign in", forgot: "Send code", reset: "Set password & sign in" }[mode]}
            </Button>

            {mode === "login" && (
              <button type="button" onClick={() => switchTo("forgot")} className="w-full text-center text-[13.5px] font-bold" style={{ color: t.accent }}>Forgot your password?</button>
            )}
          </form>

          {mode === "register" && (
            <p className="mt-5 text-[12.5px] leading-relaxed" style={{ color: t.muted }}>
              By creating an account you agree to share your name, phone number and email with {gate.name} so they can fulfil your orders.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
