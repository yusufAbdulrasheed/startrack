import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingCart, Package, Settings, Receipt,
  HelpCircle, LogOut, Globe2, Home, Plus, LifeBuoy,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { typeMeta } from "@/lib/businessTypes";
import { HelpPanel } from "@/components/layout/HelpPanel";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; perm?: string; module?: string; capability?: string };
type NavGroup = {
  to: string;                 // the group's own landing screen
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string;
  children?: NavItem[];       // revealed while the group is active
};

/**
 * Six primary destinations, matching the design. Everything else is a child
 * of one of them and appears once you're inside — so the spine stays short
 * without any screen becoming unreachable.
 *
 * perm gates by role; module gates by what this business has switched on.
 * Labels marked with terminology adapt to the business type (pharmacy → Medicines).
 */
function buildNav(t: { products: string; pos: string }): NavGroup[] {
  return [
    {
      to: "/app/pos", label: t.pos, icon: ShoppingCart, perm: "sales",
      children: [
        { to: "/app/pos", label: "Sell", perm: "sales" },
        { to: "/app/front-desk", label: "Front Desk", perm: "sales", capability: "rooms" },
        { to: "/app/cold-room", label: "Cold Room", perm: "sales", capability: "coldChain" },
        { to: "/app/kitchen", label: "Kitchen Queue", perm: "sales", capability: "kitchenQueue" },
        { to: "/app/jobs", label: "Job Tickets", perm: "sales", capability: "jobs" },
        { to: "/app/members", label: "Members", perm: "sales", capability: "memberships" },
        { to: "/app/returns", label: "Returns", perm: "returns", module: "returns" },
        { to: "/app/activity", label: "My Activity", perm: "activity" },
      ],
    },
    {
      to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard_ops",
      children: [
        { to: "/app/dashboard", label: "Overview", perm: "dashboard_ops" },
        { to: "/app/ask-ai", label: "Ask AI", perm: "dashboard_ops" },
        { to: "/app/customers", label: "Customers", perm: "customers", module: "customers" },
        { to: "/app/expenses", label: "Expenses", perm: "expenses", module: "expenses" },
        { to: "/app/staff", label: "Staff", perm: "staff_mgmt" },
        { to: "/app/attendance", label: "Attendance", perm: "dashboard_ops", module: "attendance" },
        { to: "/app/vaccinations", label: "Vaccination & Medication", perm: "dashboard_ops", capability: "medication" },
      ],
    },
    {
      to: "/app/products", label: t.products, icon: Package, perm: "stock",
      children: [
        { to: "/app/products", label: "Catalog", perm: "stock" },
        { to: "/app/stock-in", label: "Stock In", perm: "stock" },
        { to: "/app/transfers", label: "Transfers", perm: "stock", module: "transfers" },
        { to: "/app/serials", label: "Serial Numbers", perm: "stock", capability: "serials" },
        { to: "/app/production", label: "Production", perm: "stock", capability: "production" },
        { to: "/app/suppliers", label: "Suppliers", perm: "stock", module: "suppliers" },
        { to: "/app/stock-count", label: "Stock Counts", perm: "stock", module: "stock_count" },
        { to: "/app/cohorts", label: "Batches", perm: "stock", capability: "cohorts" },
      ],
    },
    { to: "/app/sales", label: "History", icon: Receipt, perm: "dashboard_ops" },
    { to: "/app/tickets", label: "Support", icon: LifeBuoy, perm: "sales" },
    {
      to: "/app/settings", label: "Settings", icon: Settings, perm: "settings",
      children: [
        { to: "/app/settings", label: "Preferences", perm: "settings" },
        { to: "/app/businesses", label: "My Businesses", perm: "*" },
        { to: "/app/audit", label: "Audit Log", perm: "settings" },
      ],
    },
  ];
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-nav-line">
      <div className="w-8 h-8 rounded-lg bg-nav-active flex items-center justify-center shrink-0">
        <svg viewBox="0 0 20 20" fill="none" className="w-[18px] h-[18px]">
          <path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="15" r="3" fill="white" opacity=".9" />
          <path d="M14.8 15l1 1L17.6 13.5" stroke="var(--st-nav-active)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="font-display font-bold text-[15px] tracking-tight text-nav-strong">StarTrack</span>
    </div>
  );
}

export function Sidebar({ open = false }: { open?: boolean }) {
  const { session, can, hasModule, hasCapability, activeBusiness, activeBranch, logout } = useSession();
  const { pathname } = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  const groups = buildNav(typeMeta(activeBusiness?.typeKey))
    .filter((g) => !g.perm || can(g.perm))
    .map((g) => ({
      ...g,
      children: g.children?.filter(
        (c) => (!c.perm || can(c.perm)) && (!c.module || hasModule(c.module)) && (!c.capability || hasCapability(c.capability))
      ),
    }))
    // A group with a single child is just itself — don't show a list of one.
    .map((g) => ({ ...g, children: (g.children?.length ?? 0) > 1 ? g.children : undefined }));

  const isGroupActive = (g: NavGroup) =>
    pathname === g.to || (g.children?.some((c) => c.to === pathname) ?? false);

  return (
    <aside
      className={cn(
        "w-[236px] shrink-0 h-full bg-nav border-r border-nav-line flex flex-col",
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:transition-transform max-lg:duration-200",
        open ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"
      )}
    >
      <Brand />

      {/* Who and where — the design puts this at the top of the spine. */}
      <div className="px-4 py-3.5 border-b border-nav-line">
        <div className="text-[13px] font-semibold text-nav-strong truncate capitalize">
          {session?.role === "owner" || session?.role === "admin" ? "Admin Portal" : `${session?.role ?? ""} Portal`}
        </div>
        <div className="text-[11px] text-nav-fg truncate mt-0.5">{activeBranch?.name || activeBusiness?.name || "—"}</div>
      </div>

      {can("sales") && (
        <div className="px-3 pt-3" data-tour="new-sale-btn">
          <NavLink
            to="/app/pos"
            className="w-full flex items-center justify-center gap-1.5 h-9 rounded-ctl bg-nav-active text-white text-[13px] font-semibold hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" /> New Sale
          </NavLink>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {/* Staff without a dashboard land on POS for speed; this is how they
            get back to their own home hub (tasks/schedule/announcements). */}
        {!can("dashboard_ops") && (
          <NavLink
            to="/app/home"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 h-10 rounded-ctl text-[13px] font-medium transition-colors",
                isActive ? "bg-nav-active text-white font-semibold" : "text-nav-fg hover:bg-nav-hover hover:text-nav-strong"
              )
            }
          >
            <Home className="w-[18px] h-[18px] shrink-0" /> Home
          </NavLink>
        )}
        {groups.map((g) => {
          const active = isGroupActive(g);
          const Icon = g.icon;
          return (
            <div key={g.label} data-tour={`nav-${g.to.replace("/app/", "")}`}>
              <NavLink
                to={g.to}
                className={cn(
                  "flex items-center gap-3 px-3 h-10 rounded-ctl text-[13px] font-medium transition-colors",
                  active ? "bg-nav-active text-white font-semibold" : "text-nav-fg hover:bg-nav-hover hover:text-nav-strong"
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {g.label}
              </NavLink>

              {active && g.children && (
                <div className="mt-0.5 mb-1.5 ml-[22px] pl-3.5 border-l border-nav-line space-y-0.5">
                  {g.children.map((c) => (
                    <NavLink
                      key={c.to + c.label}
                      to={c.to}
                      end
                      className={({ isActive }) =>
                        cn(
                          "block px-2.5 h-8 leading-8 rounded-md text-[12.5px] transition-colors truncate",
                          isActive ? "text-nav-strong font-semibold bg-nav-hover" : "text-nav-fg hover:text-nav-strong"
                        )
                      }
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-nav-line space-y-0.5">
        {/* platformLink: only StarTrack's own staff ever see this. */}
        {session?.platformRole && session.platformRole !== "none" && (
          <NavLink
            to="/app/platform"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 h-9 rounded-ctl text-[13px] font-semibold transition-colors",
                isActive ? "bg-nav-active text-white" : "text-nav-fg hover:bg-nav-hover hover:text-nav-strong"
              )
            }
          >
            <Globe2 className="w-[18px] h-[18px] shrink-0" /> Platform
          </NavLink>
        )}
        <button
          data-tour="sidebar-help"
          onClick={() => setHelpOpen(true)}
          className="w-full flex items-center gap-3 px-3 h-9 rounded-ctl text-[13px] font-medium text-nav-fg hover:bg-nav-hover hover:text-nav-strong transition-colors"
        >
          <HelpCircle className="w-[18px] h-[18px] shrink-0" /> Help
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 h-9 rounded-ctl text-[13px] font-medium text-nav-fg hover:bg-nav-hover hover:text-nav-strong transition-colors"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" /> Logout
        </button>
      </div>
      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </aside>
  );
}
