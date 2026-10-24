import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white",
  secondary: "bg-surface text-t1 border border-line-2 hover:bg-primary-soft hover:border-primary hover:text-primary",
  outline: "border border-line-2 text-t2 hover:bg-primary-soft hover:border-primary hover:text-primary",
  ghost: "text-t2 hover:bg-surface-3 hover:text-t1",
  success: "bg-success text-white hover:brightness-110",
  danger: "bg-danger text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[12.5px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-[13px] gap-2 rounded-xl",
  lg: "h-12 px-6 text-[14px] gap-2 rounded-xl",
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
        "inline-flex items-center justify-center font-bold tracking-[-0.005em] whitespace-nowrap transition-colors duration-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer select-none",
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
