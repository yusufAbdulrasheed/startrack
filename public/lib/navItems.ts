import type { ServiceMeta } from "@/lib/businessTypes";
import type { BusinessNavItem } from "#shared/businessTypes.js";
import {
  LayoutDashboard, ShoppingCart, Package, Settings, LifeBuoy, ClipboardList, Truck, Users, Wallet, UserCog,
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
 * The app's sections, each holding the pages that belong to it: selling under
 * Sales, stock under Inventory, buying under Purchases, money under Finance,
 * people under Staff, and account matters under Settings. Trade-specific
 * pages (jobs, batches, serial numbers, classes ...) come from each business's
 * manifest and join the Operations or Inventory section, which
 * only appears for trades that have them.
 *
 * Every page carries its own gates: perm (role), module (switched on for this
 * business), capability (the trade supports it), feature (the plan includes
 * it). A section shows when at least one of its pages does, and opens on the
 * first of them (see useNav.ts).
 *
 * The single source of truth for "every page in the app" — both the
 * Sidebar and the header's global search (GlobalSearch.tsx, "jump to a
 * page/module" results) read from this, so they can never drift apart.
 */
export function buildNav(t: { products: string; pos: string; service?: ServiceMeta | null; nav?: BusinessNavItem[] }): NavGroup[] {
  const groups: NavGroup[] = [
    {
      to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard,
      children: [
        { to: "/app/dashboard", label: "Overview", perm: "dashboard_ops" },
        { to: "/app/all-stores", label: "All stores", perm: "dashboard_finance", feature: "multiStore" },
        { to: "/app/ask-ai", label: "Ask AI", perm: "dashboard_ops", feature: "ai" },
      ],
    },
    {
      to: "/app/pos", label: "Sales", icon: ShoppingCart,
      children: [
        { to: "/app/pos", label: t.pos, perm: "sales" },
        { to: "/app/sales", label: "Sales History", perm: "sales_view" },
        { to: "/app/returns", label: "Returns", perm: "returns", module: "returns", feature: "returns" },
        { to: "/app/orders", label: "Online orders", perm: "sales", feature: "sitePage" },
        { to: "/app/activity", label: "My Activity", perm: "activity" },
      ],
    },
    {
      to: "/app/jobs", label: "Operations", icon: ClipboardList,
      children: [
        { to: "/app/jobs", label: "Job Tickets", perm: "sales", capability: "jobs", feature: "verticals" },
      ],
    },
    {
      to: "/app/products", label: "Inventory", icon: Package,
      children: [
        { to: "/app/products", label: t.products, perm: "inventory_view" },
        { to: "/app/inventory", label: "Stock levels", perm: "inventory_view" },
        { to: "/app/stock-count", label: "Stock Counts", perm: "stock_count", module: "stock_count", feature: "stockCount" },
        { to: "/app/transfers", label: "Transfers", perm: "transfers", module: "transfers", feature: "transfers" },
      ],
    },
    {
      to: "/app/stock-in", label: "Purchases", icon: Truck,
      children: [
        { to: "/app/stock-in", label: "Stock In", perm: "stock_in" },
        { to: "/app/suppliers", label: "Suppliers", perm: "stock", module: "suppliers", feature: "suppliers" },
      ],
    },
    {
      to: "/app/customers", label: "Customers", icon: Users,
      children: [
        { to: "/app/customers", label: "Customers", perm: "customers", module: "customers" },
      ],
    },
    {
      to: "/app/invoices", label: "Finance", icon: Wallet,
      children: [
        { to: "/app/invoices", label: "Invoices", perm: "invoices", feature: "invoices" },
        { to: "/app/expenses", label: "Expenses", perm: "expenses", module: "expenses" },
      ],
    },
    {
      to: "/app/staff", label: "Staff", icon: UserCog,
      children: [
        { to: "/app/staff", label: "Staff", perm: "staff_view" },
        { to: "/app/attendance", label: "Attendance", perm: "dashboard_ops", module: "attendance", feature: "attendance" },
      ],
    },
    {
      to: "/app/help", label: "Support", icon: LifeBuoy,
      children: [
        // Owners and admins only: managers and sales reps raise things with their own team (chat, tickets).
        { to: "/app/help", label: "Help from StarTrack", perm: "startrack_help" },
        { to: "/app/chat", label: "Team chat" },
        { to: "/app/tickets", label: "Internal tickets", perm: "sales" },
      ],
    },
    {
      to: "/app/settings", label: "Settings", icon: Settings,
      children: [
        { to: "/app/settings", label: "Preferences", perm: "settings" },
        { to: "/app/receipt", label: "Receipt designer", perm: "settings", feature: "receiptCustom" },
        { to: "/app/my-site", label: "Business page", perm: "*", feature: "sitePage" },
        { to: "/app/businesses", label: "My Businesses", perm: "*" },
        { to: "/app/import-history", label: "Import past sales", perm: "*", feature: "csvImport" },
        { to: "/app/billing", label: "Plan & billing", perm: "*" },
        { to: "/app/audit", label: "Audit Log", perm: "settings", feature: "auditLog" },
      ],
    },
  ];
  // A business's own pages (its manifest's `nav`) join the section they name.
  const withOwn = groups.map((g) => {
    const group = g.label === "Operations" ? "operations" : g.label === "Inventory" ? "inventory" : null;
    const own = group ? (t.nav || []).filter((n) => n.group === group).map(({ group: _g, ...item }) => item) : [];
    return own.length ? { ...g, children: [...(g.children || []), ...own] } : g;
  });
  return t.service ? forService(withOwn, t.service) : withOwn;
}

/**
 * A trade that sells services, not stock: the Inventory section becomes the
 * Services catalogue, and the stock machinery (levels, counts, transfers,
 * purchasing, online ordering) only stays where the trade also sells a few
 * physical goods.
 */
function forService(groups: NavGroup[], svc: ServiceMeta): NavGroup[] {
  const stockPages = new Set(["/app/inventory", "/app/stock-count", "/app/transfers", "/app/serials", "/app/production", "/app/cohorts"]);
  return groups
    .filter((g) => svc.physical || g.to !== "/app/stock-in") // no stock to buy
    .map((g) => {
      if (g.to === "/app/products") {
        return {
          ...g,
          label: "Services",
          children: g.children
            ?.filter((c) => svc.physical || !stockPages.has(c.to))
            .map((c) => (c.to === "/app/inventory" ? { ...c, label: "Retail stock" } : c)),
        };
      }
      if (g.to === "/app/pos" && !svc.physical) {
        return { ...g, children: g.children?.filter((c) => c.to !== "/app/orders") };
      }
      return g;
    });
}

/** Every group and child, flattened to one list of jump-able destinations. */
export function flattenNav(t: { products: string; pos: string }): NavItem[] {
  const out: NavItem[] = [];
  for (const g of buildNav(t)) {
    // A section is reached through its pages; only a page-less section is a destination itself.
    if (!g.children) out.push({ to: g.to, label: g.label, perm: g.perm });
    for (const c of g.children || []) out.push(c);
  }
  return out;
}
