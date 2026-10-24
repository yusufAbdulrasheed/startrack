import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * THE StarTrack logo. There is exactly one drawing of it, and this is where it
 * lives: the sidebar, sign-in, register and landing pages all render this
 * component. The same shapes are repeated (they have to be: they're not React)
 * in public/static/favicon.svg and in the PDF report header
 * (server/modules/reports/renderPdf.js). Change all three together.
 */
export function BrandMark({ className, glow }: { className?: string; glow?: boolean }) {
  const id = `bm${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="StarTrack"
      className={cn("shrink-0", className)}
      style={glow ? { borderRadius: "25%", boxShadow: "var(--st-shadow-brand)" } : undefined}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3538f0" />
          <stop offset="0.6" stopColor="#5a3bf4" />
          <stop offset="1" stopColor="#7b3cf5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <path d="M8 10.5h16M8 16h10.5M8 21.5h12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="24" cy="21.5" r="4" fill="#fff" />
      <path d="M22.2 21.5l1.4 1.4 2.4-2.8" fill="none" stroke="#4a3bf4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
