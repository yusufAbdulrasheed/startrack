import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-brand hover:from-brand-500 hover:to-brand-600 active:scale-[0.98]",
  secondary: "bg-surface-2 text-t2 border border-line-2 hover:bg-surface-3 hover:text-t1",
  outline: "border border-line-2 text-t2 hover:bg-surface-2 hover:text-t1",
  ghost: "text-t2 hover:bg-surface-2 hover:text-t1",
  success: "bg-gradient-to-b from-[#14c98e] to-success text-white hover:brightness-105 active:scale-[0.98]",
  danger: "bg-danger text-white hover:brightness-110 active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-[13px] gap-2 rounded-ctl",
  lg: "h-12 px-6 text-[14px] gap-2 rounded-ctl",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: Variant;
  size?: Size;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold whitespace-nowrap transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
