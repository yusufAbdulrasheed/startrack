import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, type Tone } from "@/components/ui/StatCard";

/**
 * A titled card. Every content card in the app uses this header so titles,
 * subtitles and actions land in the same place, at the same size, everywhere.
 * `flush` removes the body padding for tables and lists that run edge to edge
 * (the header then gets a hairline under it).
 */
export function Panel({
  title, subtitle, action, icon: Icon, tone = "brand", flush, className, bodyClassName, children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("bg-surface border border-line rounded-card shadow-e1 overflow-hidden min-w-0", className)}>
      <header className={cn("flex items-center gap-3 px-5 py-4", flush && "border-b border-line")}>
        {Icon && (
          <span className="grid place-items-center w-9 h-9 rounded-xl text-white shrink-0" style={{ background: TONES[tone].chip }}>
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-t1 leading-tight truncate">{title}</h3>
          {subtitle && <p className="text-[12.5px] text-t3 mt-0.5 truncate">{subtitle}</p>}
        </div>
        {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
      </header>
      <div className={cn(!flush && "px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * A row of figures inside one card, separated by hairlines. For dense
 * summaries (sales totals) where a tile each would be too much.
 */
export function StatStrip({
  cells, className,
}: {
  cells: { label: string; value: string; hint?: string; tone?: Tone; strong?: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-card border border-line overflow-hidden bg-line shadow-e1", className)}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px">
        {cells.map((c) => (
          <div key={c.label} title={c.hint} className={cn("px-4 py-3.5 min-w-0", c.strong ? "bg-primary-softer" : "bg-surface")}>
            <div className="text-[11.5px] font-semibold text-t3 truncate">{c.label}</div>
            <div
              className="mt-1 text-[18px] font-bold font-mono truncate tracking-[-0.01em]"
              style={{ color: c.tone ? TONES[c.tone].text : c.strong ? "var(--st-primary)" : "var(--st-text-1)" }}
            >
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
