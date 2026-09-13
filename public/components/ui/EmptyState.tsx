import type { LucideIcon } from "lucide-react";

// Empty states teach — never a blank white screen.
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-full bg-primary-soft text-primary flex items-center justify-center mb-4">
        <Icon className="w-7 h-7" />
      </div>
      <div className="text-[15px] font-bold text-t1">{title}</div>
      {body && <p className="text-[13px] text-t3 mt-1 max-w-sm">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-2 border-line border-t-primary animate-spin" />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3 mb-5">
      <div>
        <h1 className="font-display text-[20px] font-extrabold tracking-tight text-t1">{title}</h1>
        {subtitle && <p className="text-[13px] text-t3 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
