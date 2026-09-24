import {
  LayoutDashboard, ShoppingCart, Package, Settings, Receipt, LifeBuoy,
} from "lucide-react";

export type NavItem = { to: string; label: string; perm?: string; module?: string; capability?: string };
export type NavGroup = {
  to: string; // the group's own landing screen
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string;
  children?: NavItem[]; // revealed while the group is active
};

/**
 * Six primary destinations, matching the design. Everything else is a child
 * of one of them and appears once you're inside — so the spine stays short
 * without any screen becoming unreachable.
 *
 * perm gates by role; module gates by what this business has switched on.
 * Labels marked with terminology adapt to the business type (pharmacy → Medicines).
 *
 * The single source of truth for "every page in the app" — both the
 * Sidebar and the header's global search (GlobalSearch.tsx, "jump to a
 * page/module" results) read from this, so they can never drift apart.
 */
export function buildNav(t: { products: string; pos: string }): NavGroup[] {
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

/** Every group and child, flattened to one list of jump-able destinations. */
export function flattenNav(t: { products: string; pos: string }): NavItem[] {
  const out: NavItem[] = [];
  for (const g of buildNav(t)) {
    out.push({ to: g.to, label: g.label, perm: g.perm });
    for (const c of g.children || []) out.push(c);
  }
  return out;
}
