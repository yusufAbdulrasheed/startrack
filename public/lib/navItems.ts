import {
  LayoutDashboard, ShoppingCart, Package, Settings, Receipt, LifeBuoy,
} from "lucide-react";

export type NavItem = { to: string; label: string; perm?: string; module?: string; capability?: string; feature?: string };
export type NavGroup = {
  to: string; // the group's own landing screen
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  perm?: string;
  children?: (NavItem & { locked?: boolean })[]; // revealed while the group is active
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
        { to: "/app/orders", label: "Online orders", perm: "sales", feature: "sitePage" },
        { to: "/app/invoices", label: "Invoices", perm: "customers", feature: "invoices" },
        { to: "/app/front-desk", label: "Front Desk", perm: "sales", capability: "rooms", feature: "verticals" },
        { to: "/app/cold-room", label: "Cold Room", perm: "sales", capability: "coldChain", feature: "verticals" },
        { to: "/app/kitchen", label: "Kitchen Queue", perm: "sales", capability: "kitchenQueue", feature: "verticals" },
        { to: "/app/jobs", label: "Job Tickets", perm: "sales", capability: "jobs", feature: "verticals" },
        { to: "/app/members", label: "Members", perm: "sales", capability: "memberships", feature: "verticals" },
        { to: "/app/academy", label: "Academy", perm: "sales", capability: "programs", feature: "verticals" },
        { to: "/app/appointments", label: "Appointments", perm: "sales", capability: "appointments", feature: "verticals" },
        { to: "/app/projects", label: "Projects", perm: "sales", capability: "projects", feature: "verticals" },
        { to: "/app/returns", label: "Returns", perm: "returns", module: "returns", feature: "returns" },
        { to: "/app/activity", label: "My Activity", perm: "activity" },
      ],
    },
    {
      to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard_ops",
      children: [
        { to: "/app/dashboard", label: "Overview", perm: "dashboard_ops" },
        { to: "/app/all-stores", label: "All stores", perm: "dashboard_finance", feature: "multiStore" },
        { to: "/app/ask-ai", label: "Ask AI", perm: "dashboard_ops", feature: "ai" },
        { to: "/app/customers", label: "Customers", perm: "customers", module: "customers" },
        { to: "/app/expenses", label: "Expenses", perm: "expenses", module: "expenses" },
        { to: "/app/staff", label: "Staff", perm: "staff_mgmt" },
        { to: "/app/attendance", label: "Attendance", perm: "dashboard_ops", module: "attendance", feature: "attendance" },
        { to: "/app/vaccinations", label: "Vaccination & Medication", perm: "dashboard_ops", capability: "medication", feature: "verticals" },
      ],
    },
    {
      to: "/app/products", label: t.products, icon: Package, perm: "stock",
      children: [
        { to: "/app/products", label: "Catalog", perm: "stock" },
        { to: "/app/inventory", label: "Inventory", perm: "stock" },
        { to: "/app/stock-in", label: "Stock In", perm: "stock" },
        { to: "/app/transfers", label: "Transfers", perm: "stock", module: "transfers", feature: "transfers" },
        { to: "/app/serials", label: "Serial Numbers", perm: "stock", capability: "serials", feature: "verticals" },
        { to: "/app/production", label: "Production", perm: "stock", capability: "production", feature: "verticals" },
        { to: "/app/suppliers", label: "Suppliers", perm: "stock", module: "suppliers", feature: "suppliers" },
        { to: "/app/stock-count", label: "Stock Counts", perm: "stock", module: "stock_count", feature: "stockCount" },
        { to: "/app/cohorts", label: "Batches", perm: "stock", capability: "cohorts", feature: "verticals" },
      ],
    },
    { to: "/app/sales", label: "History", icon: Receipt, perm: "dashboard_ops" },
    { to: "/app/tickets", label: "Support", icon: LifeBuoy, perm: "sales" },
    {
      to: "/app/settings", label: "Settings", icon: Settings, perm: "settings",
      children: [
        { to: "/app/settings", label: "Preferences", perm: "settings" },
        { to: "/app/businesses", label: "My Businesses", perm: "*" },
        { to: "/app/my-site", label: "Business page", perm: "*", feature: "sitePage" },
        { to: "/app/import-history", label: "Import past sales", perm: "*", feature: "csvImport" },
        { to: "/app/receipt", label: "Receipt designer", perm: "settings", feature: "receiptCustom" },
        { to: "/app/billing", label: "Plan & billing", perm: "*" },
        { to: "/app/audit", label: "Audit Log", perm: "settings", feature: "auditLog" },
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
