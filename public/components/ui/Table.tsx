import { cn } from "@/lib/utils";

/**
 * Thin styled wrappers around the plain <table> markup that Dashboard,
 * Products, Sales and Hotel each hand-rolled identically. Callers still
 * compose their own <thead>/<tr>/<td> content and column sets — this only
 * centralizes the shared visual convention so it's restyled in one place.
 */
export function Table({ className, children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full", className)} {...props}>
      {children}
    </table>
  );
}

export function TR({
  className,
  hover = true,
  ...props
}: { hover?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("border-b border-line last:border-0", hover && "hover:bg-surface-2/70 transition-colors", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-[11.5px] font-medium text-t3 bg-surface-2 border-b border-line whitespace-nowrap",
        className
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-2.5 text-[13px] text-t1", className)} {...props} />;
}
