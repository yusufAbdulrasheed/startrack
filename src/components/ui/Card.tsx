import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
  interactive,
  ...props
}: { interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-card shadow-e1",
        interactive && "transition-all duration-200 hover:shadow-e2 hover:-translate-y-0.5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = "brand",
  className,
  children,
}: {
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    brand: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    neutral: "bg-surface-3 text-t3",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
