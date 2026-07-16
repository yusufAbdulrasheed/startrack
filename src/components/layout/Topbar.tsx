import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Search, Store, Building2 } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export function Topbar() {
  const navigate = useNavigate();
  const { session, activeBusiness, activeBranch, branchesForActive, setActiveBusiness, setActiveBranch, logout } = useSession();
  const [branchOpen, setBranchOpen] = useState(false);
  const [bizOpen, setBizOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setBranchOpen(false); setBizOpen(false); setUserOpen(false); } };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!session) return null;
  const multiBiz = session.businesses.length > 1;

  return (
    <header ref={ref} className="h-16 shrink-0 bg-surface border-b border-line flex items-center gap-3 px-4">
      {/* Business (shows only if 2+) → Branch switcher */}
      <div className="flex items-center gap-2">
        {multiBiz ? (
          <div className="relative">
            <button onClick={() => { setBizOpen((v) => !v); setBranchOpen(false); setUserOpen(false); }} className="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-2 border border-line text-[13px] font-semibold text-t1 hover:bg-surface-3">
              <Store className="w-4 h-4 text-primary" /> {activeBusiness?.name} <ChevronDown className="w-3.5 h-3.5 text-t3" />
            </button>
            {bizOpen && (
              <div className="absolute top-full mt-1 left-0 w-52 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-t4">My Businesses</div>
                {session.businesses.map((b) => (
                  <button key={b.id} onClick={() => { setActiveBusiness(b.id); setBizOpen(false); }} className={cn("w-full flex items-center gap-2 text-left px-3 py-2 text-[13px] hover:bg-surface-3", b.id === activeBusiness?.id ? "text-primary font-semibold" : "text-t2")}>
                    <Building2 className="w-3.5 h-3.5" /> {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-2 border border-line text-[13px] font-semibold text-t1">
            <Store className="w-4 h-4 text-primary" /> {activeBusiness?.name}
          </div>
        )}

        {branchesForActive.length > 0 && (
          <div className="relative">
            <button onClick={() => { setBranchOpen((v) => !v); setBizOpen(false); setUserOpen(false); }} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-line-2 text-[13px] font-medium text-t2 hover:bg-surface-3">
              {activeBranch?.name} <ChevronDown className="w-3.5 h-3.5 text-t3" />
            </button>
            {branchOpen && (
              <div className="absolute top-full mt-1 left-0 w-44 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
                {branchesForActive.map((b) => (
                  <button key={b.id} onClick={() => { setActiveBranch(b.id); setBranchOpen(false); }} className={cn("w-full text-left px-3 py-2 text-[13px] hover:bg-surface-3", b.id === activeBranch?.id ? "text-primary font-semibold" : "text-t2")}>{b.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
        <input placeholder="Search anything…  (Ctrl K)" className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer" />
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <button className="relative w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t3 hover:bg-surface-3 hover:text-t1 transition-colors">
          <Bell className="w-[17px] h-[17px]" />
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">3</span>
        </button>
        <ThemeToggle />

        {/* User menu */}
        <div className="relative">
          <button onClick={() => { setUserOpen((v) => !v); setBizOpen(false); setBranchOpen(false); }} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-surface-3 transition-colors">
            <span className="w-7 h-7 rounded-lg bg-primary-soft text-primary font-bold text-[13px] flex items-center justify-center">{session.user.name[0]?.toUpperCase()}</span>
            <ChevronDown className="w-3.5 h-3.5 text-t3" />
          </button>
          {userOpen && (
            <div className="absolute top-full mt-1 right-0 w-52 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
              <div className="px-3 py-2.5 border-b border-line">
                <div className="text-[13px] font-semibold text-t1 truncate">{session.user.name}</div>
                <div className="text-[11px] text-t3 truncate">{session.user.email}</div>
                <div className="mt-1 inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-soft text-primary capitalize">{session.role}</div>
              </div>
              <button onClick={() => { logout(); navigate("/login"); }} className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-[13px] text-danger hover:bg-danger-soft">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
