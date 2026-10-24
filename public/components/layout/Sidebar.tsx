import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Globe2, HelpCircle, Home, LogOut, X } from "lucide-react";
import { useSession } from "@/lib/session";
import { HelpPanel } from "@/components/layout/HelpPanel";
import { useNavGroups } from "@/components/layout/useNav";
import { LockChip } from "@/components/plan/PlanUi";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl flex items-center justify-center shrink-0", className)} style={{ background: "var(--st-gradient-primary)", boxShadow: "var(--st-shadow-brand)" }}>
      <svg viewBox="0 0 20 20" fill="none" className="w-[55%] h-[55%]">
        <path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="16" cy="15" r="3" fill="white" />
        <path d="M14.8 15l1 1L17.6 13.5" stroke="#4a3bf4" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Labels disappear (but stay readable to screen readers) when the sidebar is
// collapsed to its icon rail. The collapsed state only applies from `lg` up;
// on a phone the sidebar is a full drawer.
const label = "group-data-[collapsed=true]/side:lg:sr-only";

const linkBase =
  "flex items-center gap-3 px-4 py-[11px] rounded-xl text-[14px] font-semibold whitespace-nowrap transition-colors group-data-[collapsed=true]/side:lg:justify-center group-data-[collapsed=true]/side:lg:px-2";

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: {
  collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void;
}) {
  const { session, can, logout } = useSession();
  const { groups, active } = useNavGroups();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const isPlatform = !!session?.platformRole && session.platformRole !== "none";

  const item = (isActive: boolean) =>
    cn(linkBase, isActive ? "bg-primary text-white" : "text-nav-fg hover:bg-nav-hover hover:text-nav-strong");

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={cn("lg:hidden fixed inset-0 z-[55] bg-ink/55 backdrop-blur-[2px] transition-opacity", mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none")}
      />
      <aside
        data-collapsed={collapsed}
        style={{ background: "var(--st-gradient-ink)" }}
        className={cn(
          "group/side text-nav-strong flex flex-col overflow-hidden shrink-0",
          "fixed inset-y-0 left-0 z-[60] w-[280px] transition-[width,transform] duration-200 ease-out",
          "lg:relative lg:z-20 lg:translate-x-0",
          collapsed ? "lg:w-[80px]" : "lg:w-[264px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Decorative wave, bottom of the sidebar */}
        <svg aria-hidden viewBox="0 0 264 240" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 w-full h-60 pointer-events-none group-data-[collapsed=true]/side:lg:hidden">
          <path d="M0 150 C 60 110, 110 190, 170 150 S 250 100, 264 120 V240 H0 Z" fill="rgba(143,148,255,0.06)" />
          <path d="M0 190 C 70 150, 120 230, 180 190 S 245 150, 264 165 V240 H0 Z" fill="rgba(143,148,255,0.07)" />
          <path d="M0 150 C 60 110, 110 190, 170 150 S 250 100, 264 120" fill="none" stroke="rgba(160,170,255,0.18)" strokeWidth="1" />
        </svg>

        {/* Brand block */}
        <div className="relative px-5 pt-6 pb-5 flex flex-col gap-3 group-data-[collapsed=true]/side:lg:px-2">
          <div className="flex items-center justify-between gap-2 group-data-[collapsed=true]/side:lg:flex-col group-data-[collapsed=true]/side:lg:gap-3">
            <Link to="/app/dashboard" className="flex items-center gap-3 min-w-0" aria-label="StarTrack">
              <BrandMark className="w-10 h-10" />
              <span className={cn("font-extrabold text-[17px] tracking-[-0.02em] text-white", label)}>StarTrack</span>
            </Link>
            <button
              onClick={onToggle}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden lg:grid place-items-center w-9 h-9 rounded-full border border-nav-line bg-white/5 text-nav-fg hover:bg-white/10 hover:text-white transition-colors"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button onClick={onClose} aria-label="Close menu" className="lg:hidden grid place-items-center w-9 h-9 rounded-full border border-nav-line bg-white/5 text-nav-fg hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <span className={cn("self-start px-2.5 py-[3px] rounded-full border border-nav-line bg-white/5 text-[11px] font-bold tracking-[0.12em] uppercase text-nav-fg whitespace-nowrap", label)}>
            {session?.role === "owner" || session?.role === "admin" ? "Admin portal" : `${session?.role ?? ""} portal`}
          </span>
        </div>

        {/* Sections. The current section opens to show its pages. */}
        <nav className="relative flex-1 overflow-y-auto px-4 group-data-[collapsed=true]/side:lg:px-3 flex flex-col gap-1.5" aria-label="Main">
          {!can("dashboard_ops") && (
            <NavLink to="/app/home" onClick={onClose} title="Home" className={() => item(pathname === "/app/home")}>
              <Home className="w-[18px] h-[18px] shrink-0 opacity-90" strokeWidth={1.8} />
              <span className={label}>Home</span>
            </NavLink>
          )}
          {groups.map((g) => {
            const isActive = active?.to === g.to;
            return (
              <div key={g.label}>
                <NavLink to={g.to} onClick={onClose} title={g.label} data-tour={`nav-${g.to.replace("/app/", "")}`} className={() => item(isActive)}>
                  <g.icon className="w-[18px] h-[18px] shrink-0 opacity-90" strokeWidth={1.8} />
                  <span className={label}>{g.label}</span>
                </NavLink>
                {isActive && g.children && (
                  <div className="my-1.5 ml-[26px] pl-4 border-l border-nav-line space-y-0.5 group-data-[collapsed=true]/side:lg:hidden">
                    {g.children.map((c) => (
                      <NavLink
                        key={c.to + c.label}
                        to={c.to}
                        end
                        onClick={onClose}
                        className={({ isActive: on }) =>
                          cn(
                            "block px-3 py-2 rounded-lg text-[13px] font-medium transition-colors",
                            on ? "bg-white/10 text-white" : "text-nav-fg hover:text-white hover:bg-white/[0.06]"
                          )
                        }
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{c.label}</span>
                          {c.locked && c.feature && <LockChip feature={c.feature} className="!bg-white/10 !text-white/80" />}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer: support and sign out */}
        <div className="relative p-4 flex flex-col gap-1 group-data-[collapsed=true]/side:lg:px-3">
          {isPlatform && (
            <NavLink to="/app/platform" onClick={onClose} title="Platform" className={() => item(pathname === "/app/platform")}>
              <Globe2 className="w-[18px] h-[18px] shrink-0 opacity-90" strokeWidth={1.8} />
              <span className={label}>Platform</span>
            </NavLink>
          )}
          <button
            data-tour="sidebar-help"
            onClick={() => setHelpOpen(true)}
            title="Help"
            className="flex items-center gap-3 p-3 rounded-xl text-white hover:bg-white/[0.07] transition-colors text-left group-data-[collapsed=true]/side:lg:justify-center group-data-[collapsed=true]/side:lg:px-2"
          >
            <span className="grid place-items-center w-10 h-10 rounded-full bg-white/10 shrink-0">
              <HelpCircle className="w-[18px] h-[18px]" strokeWidth={1.8} />
            </span>
            <span className={cn("flex flex-col min-w-0 leading-[1.3]", label)}>
              <strong className="text-[14px]">Help & support</strong>
              <span className="text-[12px] text-nav-fg">Guides and shortcuts</span>
            </span>
          </button>
          <button
            onClick={() => { logout(); navigate("/login"); }}
            title="Sign out"
            className={cn(linkBase, "w-full text-nav-fg hover:bg-white/[0.06] hover:text-white")}
          >
            <LogOut className="w-[18px] h-[18px] shrink-0 opacity-90" strokeWidth={1.8} />
            <span className={label}>Sign out</span>
          </button>
        </div>
        <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      </aside>
    </>
  );
}
