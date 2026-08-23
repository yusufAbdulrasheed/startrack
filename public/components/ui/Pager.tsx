import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Rows shown before a list starts paging. Short on purpose: these pages are
 *  scanned, not read, and a short page keeps the whole thing on one screen. */
export const ROWS_PER_PAGE = 6;

/**
 * Client-side paging for lists the server already returns whole.
 *
 * Returns the slice to render plus everything <Pager> needs. The page resets
 * itself whenever the filtered list shrinks past it — otherwise typing into a
 * search box leaves you stranded on an empty page 4.
 */
export function usePaged<T>(rows: T[], perPage = ROWS_PER_PAGE) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(page, pages);
  const slice = useMemo(
    () => rows.slice((safePage - 1) * perPage, safePage * perPage),
    [rows, safePage, perPage]
  );
  return {
    rows: slice,
    page: safePage,
    pages,
    setPage,
    total: rows.length,
    from: rows.length === 0 ? 0 : (safePage - 1) * perPage + 1,
    to: Math.min(safePage * perPage, rows.length),
  };
}

type PagerProps = {
  page: number; pages: number; total: number; from: number; to: number;
  onPage: (p: number) => void;
  noun?: string;
  className?: string;
};

/** Numbered pager with an ellipsis, matching the design's table footers. */
export function Pager({ page, pages, total, from, to, onPage, noun = "results", className }: PagerProps) {
  if (pages <= 1) return null;

  // Always show first, last, current and its neighbours; gaps become "…".
  const numbers: (number | "gap")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== "gap") numbers.push("gap");
  }

  const arrow = "w-8 h-8 rounded-ctl border border-line-2 bg-surface flex items-center justify-center text-t3 hover:text-primary hover:border-brand-400 disabled:opacity-40 disabled:hover:text-t3 disabled:hover:border-line-2 transition-colors";

  return (
    <div className={cn("flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-line", className)}>
      <div className="text-[12px] text-t3">
        Showing <span className="font-semibold text-t2 tabular-nums">{from}–{to}</span> of{" "}
        <span className="font-semibold text-t2 tabular-nums">{total}</span> {noun}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={arrow} aria-label="Previous page">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {numbers.map((n, i) =>
          n === "gap" ? (
            <span key={`gap-${i}`} className="w-8 text-center text-[12px] text-t4">…</span>
          ) : (
            <button
              key={n}
              onClick={() => onPage(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(
                "min-w-8 h-8 px-2 rounded-ctl text-[12px] font-semibold tabular-nums transition-colors",
                n === page
                  ? "bg-primary text-white"
                  : "border border-line-2 bg-surface text-t2 hover:text-primary hover:border-brand-400"
              )}
            >
              {n}
            </button>
          )
        )}
        <button onClick={() => onPage(page + 1)} disabled={page >= pages} className={arrow} aria-label="Next page">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
