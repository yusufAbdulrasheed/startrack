import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    // Stop the page behind scrolling under the dialog, and put the width back
    // afterwards so the layout doesn't jump as the scrollbar disappears.
    const { overflow, paddingRight } = document.body.style;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
    };
  }, [open, onClose]);

  if (!open) return null;

  /**
   * Rendered into <body> rather than in place.
   *
   * `position: fixed` is resolved against the nearest ancestor with a
   * transform, filter or backdrop-filter — not the viewport. The landing
   * page has both (a blurred sticky header, and fade-up animations that
   * leave a transform behind), which trapped this dialog inside a short
   * ancestor: it ran off the screen with its close button out of reach.
   * A portal sidesteps the whole class of bug for every modal in the app.
   */
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "relative w-full bg-surface border border-line-2 rounded-2xl shadow-e2 animate-fade-up",
          "my-auto max-h-[calc(100dvh-2rem)] flex flex-col",
          wide ? "max-w-2xl" : "max-w-md"
        )}
      >
        {/* Sticky so the way out is always on screen, however long the body. */}
        <div className="flex items-start justify-between gap-3 p-5 pb-3 shrink-0 sticky top-0 bg-surface rounded-t-2xl z-10">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold text-t1">{title}</h2>
            {subtitle && <p className="text-[12px] text-t3 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-t3 hover:bg-surface-3 hover:text-t1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body
  );
}
