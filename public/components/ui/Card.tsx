import { cn } from "@/lib/utils";

// Flat surface, hairline border. `interactive` only darkens the border on
// hover — nothing lifts or casts a shadow.
export function Card({
  className,
  children,
  interactive,
  ...props
}: { interactive?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface shadow-e1 border border-line rounded-card",
        interactive && "transition-[box-shadow,transform] duration-200 hover:shadow-lg2 hover:-translate-y-0.5",
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
    neutral: "bg-surface-3 text-t2",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-[2px] rounded-full text-[11.5px] font-semibold whitespace-nowrap leading-[18px]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
