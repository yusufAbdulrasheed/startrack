import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, Store, CreditCard, LifeBuoy, ShieldCheck, LogOut, ArrowUpRight, Search, ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BrandMark } from "@/components/brand/BrandMark";
import { useSession } from "@/lib/session";
import { ADMIN_TABS, type AdminTab } from "@/pages/platform/tabs";
import { Avatar } from "@/pages/platform/ui";
import { cn } from "@/lib/utils";

const ICONS: Record<AdminTab, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  accounts: Building2,
  businesses: Store,
  subscriptions: CreditCard,
  support: LifeBuoy,
  team: ShieldCheck,
};

// The platform console's own frame. It deliberately shares nothing with
// AppShell: there is no business or branch switcher, no till, no business
// sidebar — this person is running StarTrack, not a shop on it.
//
// Desktop: a slim icon rail on the left and a light strip on top. Phones: the
// rail becomes a bottom tab bar. `admin-theme` swaps in the console's palette.
export function AdminShell() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOverseer = session?.platformRole === "overseer";
  const tabs = ADMIN_TABS.filter((t) => !t.overseerOnly || isOverseer);

  useEffect(() => setMenu(false), [pathname]);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  function signOut() {
    logout();
    navigate("/login", { replace: true });
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/admin/accounts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
  }

  return (
    <div className="admin-theme h-full flex bg-canvas">
      {/* Desktop rail */}
      <aside className="hidden lg:flex w-[92px] shrink-0 flex-col items-center py-5 gap-1.5 bg-nav border-r border-nav-line">
        <Link to="/admin" className="mb-5" aria-label="StarTrack platform admin"><BrandMark className="w-10 h-10" glow /></Link>
        <nav className="flex flex-col items-stretch gap-1 w-full px-2.5" aria-label="Platform sections">
          {tabs.map((t) => {
            const Icon = ICONS[t.key];
            return (
              <NavLink
                key={t.key} to={`/admin/${t.key}`}
                className={({ isActive }) => cn(
                  "relative flex flex-col items-center gap-1 py-2.5 rounded-2xl text-[10.5px] font-semibold tracking-wide transition-colors",
                  isActive ? "bg-nav-active text-white" : "text-nav-fg hover:text-white hover:bg-nav-hover"
                )}
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute -left-2.5 top-3 bottom-3 w-[4px] rounded-r-full" style={{ background: "var(--st-amber)" }} />}
                    <Icon className="w-[21px] h-[21px]" strokeWidth={isActive ? 2.1 : 1.8} />
                    {t.label}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1">
          <ThemeToggle className="!text-nav-fg hover:!bg-white/10 hover:!text-white" />
          <button onClick={signOut} title="Sign out" aria-label="Sign out" className="w-10 h-10 rounded-full grid place-items-center text-nav-fg hover:text-white hover:bg-white/10 transition-colors">
            <LogOut className="w-[17px] h-[17px]" />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="shrink-0 h-16 flex items-center gap-3 px-4 lg:px-8">
          <Link to="/admin" className="lg:hidden" aria-label="StarTrack platform admin"><BrandMark className="w-9 h-9" /></Link>

          <form onSubmit={search} className="relative flex-1 max-w-[460px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an account or owner…" aria-label="Find an account"
              className="w-full h-11 pl-11 pr-4 rounded-full bg-surface border border-line text-[13.5px] text-t1 placeholder:text-t4 shadow-e1 hover:border-line-2 focus:outline-none focus:border-primary focus:shadow-[var(--st-focus-ring)] transition-[border-color,box-shadow]"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary-soft text-primary text-[11.5px] font-bold uppercase tracking-[0.1em]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" /> Platform admin
            </span>
            <div className="lg:hidden"><ThemeToggle /></div>

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
                className="flex items-center gap-2 h-11 pl-1.5 pr-3 rounded-full bg-surface border border-line shadow-e1 hover:border-line-2 transition-colors"
              >
                <Avatar name={session?.user.name || "A"} size={32} className="!rounded-full" />
                <span className="hidden sm:block text-[13px] font-semibold text-t1 max-w-[120px] truncate">{session?.user.name}</span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-t3 transition-transform", menu && "rotate-180")} />
              </button>

              {menu && (
                <div role="menu" className="absolute right-0 top-[52px] z-40 w-[264px] rounded-2xl bg-surface border border-line shadow-e2 p-2 animate-fade-in">
                  <div className="px-3 py-2.5">
                    <div className="text-[13.5px] font-semibold text-t1 truncate">{session?.user.name}</div>
                    <div className="text-[12px] text-t3 truncate">{session?.user.email}</div>
                    <span className="inline-flex mt-2 items-center h-[22px] px-2.5 rounded-full text-[11px] font-semibold bg-primary-soft text-primary">
                      {isOverseer ? "Overseer" : "Support · read-only"}
                    </span>
                  </div>
                  <div className="h-px bg-line my-1" />
                  <Link to="/app" role="menuitem" className="flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13px] font-semibold text-t1 hover:bg-surface-2 transition-colors">
                    <Store className="w-4 h-4 text-t3" /> My business <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-t4" />
                  </Link>
                  <button onClick={signOut} role="menuitem" className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-[13px] font-semibold text-danger hover:bg-danger-soft transition-colors">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content-bg flex-1 min-h-0 overflow-y-auto pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* Phone tab bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 flex items-stretch bg-nav border-t border-nav-line" aria-label="Platform sections">
        {tabs.map((t) => {
          const Icon = ICONS[t.key];
          return (
            <NavLink
              key={t.key} to={`/admin/${t.key}`}
              className={({ isActive }) => cn("flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold", isActive ? "text-white" : "text-nav-fg")}
            >
              {({ isActive }) => (
                <>
                  <span className={cn("grid place-items-center w-10 h-7 rounded-full transition-colors", isActive && "bg-nav-active")}>
                    <Icon className="w-[19px] h-[19px]" strokeWidth={isActive ? 2.1 : 1.8} />
                  </span>
                  <span className="truncate max-w-full px-0.5">{t.key === "subscriptions" ? "Billing" : t.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
