import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "./context";
import type { StoreTheme } from "./theme";

/* Small themed pieces shared by every storefront screen. Colours come from the
   business's own theme, never from the app's, so each shop looks like itself. */

export function Spinner({ t, size = 28 }: { t: StoreTheme; size?: number }) {
  return <div className="rounded-full border-2 animate-spin" style={{ width: size, height: size, borderColor: t.line, borderTopColor: t.accent }} role="status" aria-label="Loading" />;
}

export function Button({ kind = "solid", full, className, style, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "solid" | "soft" | "ghost" | "danger"; full?: boolean }) {
  const t = useTheme();
  const look =
    kind === "solid" ? { background: t.accent, color: t.onAccent, boxShadow: `0 10px 22px -12px ${t.accent}` }
    : kind === "soft" ? { background: t.soft, color: t.accent }
    : kind === "danger" ? { background: "transparent", color: t.danger, boxShadow: `inset 0 0 0 1.5px ${t.danger}` }
    : { background: "transparent", color: t.text, boxShadow: `inset 0 0 0 1.5px ${t.line}` };
  return (
    <button
      {...rest}
      style={{ ...look, ...style }}
      className={cn("inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[14.5px] font-bold whitespace-nowrap transition-[transform,opacity] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none", full && "w-full", className)}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <label className="block">
      <span className="block text-[12.5px] font-bold mb-1.5" style={{ color: t.text }}>{label}</span>
      {children}
      {hint && !error && <span className="block text-[12px] mt-1" style={{ color: t.muted }}>{hint}</span>}
      {error && <span className="block text-[12px] mt-1 font-semibold" style={{ color: t.danger }}>{error}</span>}
    </label>
  );
}

export function TextInput({ className, style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const t = useTheme();
  return (
    <input
      {...rest}
      style={{ background: t.surface, color: t.text, border: `1.5px solid ${t.line}`, ...style }}
      className={cn("w-full h-12 px-4 rounded-2xl text-[15px] outline-none transition-[border-color,box-shadow] placeholder:opacity-50 focus:shadow-[0_0_0_4px_var(--ring)]", className)}
      onFocus={(e) => { e.currentTarget.style.borderColor = t.accent; e.currentTarget.style.setProperty("--ring", `color-mix(in srgb, ${t.accent} 22%, transparent)`); rest.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = t.line; rest.onBlur?.(e); }}
    />
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput {...props} type={show ? "text" : "password"} className="pr-12" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5" style={{ color: t.muted }}>
        {show ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
      </button>
    </div>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: ReactNode }) {
  const t = useTheme();
  const c = tone === "error" ? t.danger : tone === "success" ? t.success : t.accent;
  return (
    <div role={tone === "error" ? "alert" : "status"} className="px-4 py-3 rounded-2xl text-[13.5px] font-semibold leading-snug" style={{ background: `color-mix(in srgb, ${c} 12%, ${t.surface})`, color: c, border: `1px solid color-mix(in srgb, ${c} 30%, transparent)` }}>
      {children}
    </div>
  );
}

export function Stepper({ qty, onChange, max, small }: { qty: number; onChange: (n: number) => void; max?: number; small?: boolean }) {
  const t = useTheme();
  const size = small ? "w-8 h-8" : "w-10 h-10";
  const btn = `${size} grid place-items-center rounded-full transition-transform active:scale-90 disabled:opacity-40`;
  return (
    <div className="inline-flex items-center gap-1.5" style={{ color: t.text }}>
      <button type="button" aria-label="Decrease quantity" className={btn} style={{ background: t.soft, color: t.accent }} onClick={() => onChange(qty - 1)}><Minus className="w-4 h-4" /></button>
      <span className="min-w-[28px] text-center font-extrabold tabular-nums text-[15px]" aria-live="polite">{qty}</span>
      <button type="button" aria-label="Increase quantity" className={btn} style={{ background: t.accent, color: t.onAccent }} disabled={max !== undefined && qty >= max} onClick={() => onChange(qty + 1)}><Plus className="w-4 h-4" /></button>
    </div>
  );
}

export function Pill({ color, children }: { color: string; children: ReactNode }) {
  const t = useTheme();
  return <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-bold whitespace-nowrap" style={{ background: `color-mix(in srgb, ${color} 14%, ${t.surface})`, color }}>{children}</span>;
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const t = useTheme();
  return <div className={cn("rounded-3xl", className)} style={{ background: t.surface, border: `1px solid ${t.line}`, ...style }}>{children}</div>;
}

/** A picture, or the item's first letter on the business's colour when it has none. */
export function Thumb({ name, url, size = 56 }: { name: string; url?: string; size?: number }) {
  const t = useTheme();
  if (url) return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" className="object-cover rounded-2xl shrink-0" style={{ width: size, height: size }} />;
  return (
    <span className="grid place-items-center rounded-2xl font-extrabold shrink-0" style={{ width: size, height: size, background: t.soft, color: t.accent, fontSize: size * 0.4 }}>
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
