import type { LucideIcon } from "lucide-react";

export function Placeholder({
  title,
  subtitle,
  icon: Icon,
  phase,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  phase: string;
}) {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-t1">{title}</h1>
        <p className="text-[13px] text-t3 mt-0.5">{subtitle}</p>
      </div>
      <div className="rounded-card border border-dashed border-line-2 bg-surface p-16 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary-soft text-primary flex items-center justify-center mb-4">
          <Icon className="w-7 h-7" />
        </div>
        <div className="text-[15px] font-semibold text-t1">{title} is coming in {phase}</div>
        <p className="text-[13px] text-t3 mt-1 max-w-sm">
          This screen is scaffolded and routed — the real module lands here per the build plan.
        </p>
      </div>
    </div>
  );
}
