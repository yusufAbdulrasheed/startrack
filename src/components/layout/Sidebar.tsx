import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  PackagePlus,
  ArrowLeftRight,
  Undo2,
  Users,
  ReceiptText,
  UserCog,
  Clock,
  History,
  Settings,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = { title: string; items: NavItem[] };

// Later: this list is derived from business type + role (capability engine).
const SECTIONS: NavSection[] = [
  {
    title: "Sell",
    items: [
      { to: "/app/pos", label: "Point of Sale", icon: ShoppingCart },
      { to: "/app/activity", label: "My Activity", icon: History },
      { to: "/app/returns", label: "Returns", icon: Undo2 },
    ],
  },
  {
    title: "Inventory",
    items: [
      { to: "/app/products", label: "Products", icon: Package },
      { to: "/app/stock-in", label: "Stock In", icon: PackagePlus },
      { to: "/app/transfers", label: "Transfers", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Manage",
    items: [
      { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/app/customers", label: "Customers", icon: Users },
      { to: "/app/expenses", label: "Expenses", icon: ReceiptText },
      { to: "/app/staff", label: "Staff", icon: UserCog },
      { to: "/app/attendance", label: "Attendance", icon: Clock },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/app/settings", label: "Settings", icon: Settings },
      { to: "/app/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-4 h-16 border-b border-line shrink-0">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-700 to-brand-500 shadow-brand flex items-center justify-center">
        <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
          <path d="M2 5h16M2 10h10M2 15h12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="15" r="3" fill="white" opacity=".9" />
          <path d="M14.8 15l1 1 1.8-2.5" stroke="var(--st-brand-700)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <div className="font-bold text-[15px] tracking-tight text-t1 leading-none">StarTrack</div>
        <div className="text-[10px] font-semibold tracking-widest uppercase text-t3 mt-1">Business OS</div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-full bg-surface border-r border-line flex flex-col">
      <Logo />
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-t4">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center gap-3 px-3 h-10 rounded-lg text-[13px] font-medium transition-all",
                      isActive
                        ? "bg-primary-soft text-primary font-semibold"
                        : "text-t2 hover:bg-surface-3 hover:text-t1"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-to-b from-brand-500 to-brand-700" />
                      )}
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-line">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-lg bg-primary-soft text-primary font-bold text-sm flex items-center justify-center">
            I
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-t1 truncate">Isaac</div>
            <div className="text-[11px] text-t3">Owner</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
