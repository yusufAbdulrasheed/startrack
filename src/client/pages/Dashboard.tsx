import { useState } from "react";
import {
  Wallet, ShoppingCart, TrendingUp, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight, Package,
  Boxes, CalendarClock, Receipt, Users, UserCog, ArrowDownToLine, ArrowUpFromLine, History,
  ReceiptText, ArrowLeftRight, Undo2, Wrench, RotateCcw,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { SalesHistoryView } from "@/pages/Sales";
import { fmtMoney, fmtTime, fmtDate, fmtDateTime, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Metrics = {
  today: {
    revenue: number; txns: number; profit?: number; expenses?: number;
    deltas: { revenue: number; txns: number; profit?: number };
  };
  series7d: { date: string; revenue: number }[];
  week: { revenue: number; deltaPct: number };
  paymentSplit: { cash: number; pos: number; transfer: number };
  topProducts: { id: string; name: string; sold: number; revenue: number }[];
  lowStock: { id: string; name: string; stock: number; reorderLevel: number }[];
  recentSales: { id: string; saleNo: string; at: string; staffName: string; total: number; method: string; status: string; summary: string }[];
};

const PAY_COLORS: Record<string, string> = { cash: "var(--chart-2)", pos: "var(--chart-1)", transfer: "var(--chart-3)" };
const PAY_LABELS: Record<string, string> = { cash: "Cash", pos: "POS", transfer: "Transfer" };

function ChartTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface border border-line-2 shadow-e2 px-3 py-2">
      <div className="text-[11px] font-semibold text-t3 mb-0.5">{label}</div>
      <div className="text-[14px] font-bold font-mono text-t1">{fmtMoney(payload[0].value, currency)}</div>
    </div>
  );
}

type Tab = "overview" | "sales" | "expenses" | "inventory" | "movement" | "customers" | "staff" | "expiry" | "archive";

export function Dashboard() {
  const { session, activeBusiness, activeBranch, currency, hasModule } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const { data: m, loading, error, reload } = useApi<Metrics>("/metrics/dashboard", [activeBranch?.id]);

  const firstName = session?.user.name.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loading && !m) {
    return <div className="p-8"><Spinner /></div>;
  }
  if (!m) {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <div className="text-[14px] font-semibold text-t1 mt-16">Dashboard unavailable</div>
        <p className="text-[13px] text-t3 mt-1">{error || "Your role doesn't include the dashboard."}</p>
      </div>
    );
  }

  const showProfit = m.today.profit !== undefined;
  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { weekday: "short" });
  const series = m.series7d.map((s) => ({ d: dayLabel(s.date), v: s.revenue }));
  const paySplit = (["cash", "pos", "transfer"] as const)
    .map((k) => ({ key: k, name: PAY_LABELS[k], value: Math.max(0, m.paymentSplit[k]), color: PAY_COLORS[k] }))
    .filter((p) => p.value > 0);
  const payTotal = paySplit.reduce((s, p) => s + p.value, 0);

  const delta = (n: number | undefined) =>
    n === undefined ? undefined : `${Math.abs(n)}%`;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="font-display text-[22px] font-extrabold tracking-tight text-t1">{greeting}, {firstName} 👋</h1>
          <p className="text-[13px] text-t3 mt-1">
            Here's how {activeBusiness?.name || "your business"}{activeBranch ? ` · ${activeBranch.name}` : ""} is doing today.
          </p>
        </div>
        <Button variant="secondary" size="md" onClick={reload}><RefreshCw className="w-4 h-4" /> Refresh</Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-ctl bg-surface border border-line w-fit max-w-full overflow-x-auto mb-6">
        {([
          { k: "overview", label: "Overview", icon: Wallet },
          { k: "sales", label: "Sales", icon: Receipt },
          ...(hasModule("expenses") ? [{ k: "expenses", label: "Expenses", icon: ReceiptText }] : []),
          { k: "inventory", label: "Inventory", icon: Boxes },
          { k: "movement", label: "Movement", icon: ArrowLeftRight },
          ...(hasModule("customers") ? [{ k: "customers", label: "Customers", icon: Users }] : []),
          { k: "staff", label: "Staff", icon: UserCog },
          ...(hasModule("expiry") ? [{ k: "expiry", label: "Expiry", icon: CalendarClock }] : []),
          { k: "archive", label: "Archive", icon: History },
        ] as { k: Tab; label: string; icon: any }[]).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-1.5 px-4 h-9 rounded-lg text-[13px] font-semibold transition-colors whitespace-nowrap",
              tab === k ? "bg-primary-soft text-primary" : "text-t3 hover:text-t1"
            )}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "sales" && <SalesTab currency={currency} branchKey={activeBranch?.id} />}
      {tab === "expenses" && <ExpensesTab currency={currency} branchKey={activeBranch?.id} />}
      {tab === "inventory" && <InventoryTab currency={currency} branchKey={activeBranch?.id} />}
      {tab === "movement" && <MovementTab branchKey={activeBranch?.id} />}
      {tab === "customers" && <CustomersTab currency={currency} branchKey={activeBranch?.id} />}
      {tab === "staff" && <StaffTab currency={currency} branchKey={activeBranch?.id} />}
      {tab === "expiry" && <ExpiryTab branchKey={activeBranch?.id} />}
      {tab === "archive" && <SalesHistoryView />}
      {tab !== "overview" ? null : (
      <>
      {/* KPI row */}
      <div className={cn("grid grid-cols-2 gap-4 mb-6", showProfit ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <StatCard index={0} label="Today's Revenue" value={fmtMoney(m.today.revenue, currency)}
          delta={delta(m.today.deltas.revenue)} trend={m.today.deltas.revenue >= 0 ? "up" : "down"}
          icon={Wallet} spark={m.series7d.map((s) => s.revenue)} />
        <StatCard index={1} label="Transactions" value={String(m.today.txns)}
          delta={delta(m.today.deltas.txns)} trend={m.today.deltas.txns >= 0 ? "up" : "down"} icon={ShoppingCart} />
        {showProfit && (
          <StatCard index={2} label="Today's Profit (after expenses)" value={fmtMoney(m.today.profit!, currency)}
            delta={delta(m.today.deltas.profit)} trend={(m.today.deltas.profit ?? 0) >= 0 ? "up" : "down"} icon={TrendingUp} />
        )}
        <StatCard index={3} label="Low Stock Items" value={String(m.lowStock.length)}
          delta={m.lowStock.length ? "needs action" : undefined} trend="down" icon={AlertTriangle} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[14px] font-bold text-t1">Revenue</div>
              <div className="text-[12px] text-t3">Last 7 days · daily</div>
            </div>
            <Badge tone={m.week.deltaPct >= 0 ? "success" : "danger"}>
              {m.week.deltaPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(m.week.deltaPct)}% vs last week
            </Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                  tickFormatter={(v) => (v >= 1000 ? `${currency}${Math.round(v / 1000)}k` : `${currency}${v}`)} />
                <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: "var(--chart-1)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rev)" dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--st-surface)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1">Payment Methods</div>
          <div className="text-[12px] text-t3 mb-5">Share of today's revenue</div>
          {paySplit.length === 0 ? (
            <div className="text-[12px] text-t4 py-8 text-center">No payments yet today.</div>
          ) : (
            <div className="space-y-4">
              {paySplit.map((p) => {
                const pct = Math.round((p.value / payTotal) * 100);
                return (
                  <div key={p.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-t2">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                        {p.name}
                      </span>
                      <span className="text-[12px] font-mono font-semibold text-t1 tabular-nums">
                        {pct}% · {fmtMoney(p.value, currency)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: p.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
            <span className="text-[12px] text-t3">Total today</span>
            <span className="text-[15px] font-bold font-mono text-t1">{fmtMoney(payTotal, currency)}</span>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="text-[14px] font-bold text-t1">Recent Sales</div>
          </div>
          {m.recentSales.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No sales yet" body="Ring up your first sale on the POS and it appears here in real time." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left">
                    {["Receipt", "Items", "Staff", "Method", "Amount"].map((h, i) => (
                      <th key={h} className={cn("px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-t4 border-y border-line", i === 4 && "text-right")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.recentSales.map((r) => (
                    <tr key={r.id} className={cn("hover:bg-surface-2 transition-colors border-b border-line last:border-0", r.status === "voided" && "opacity-45")}>
                      <td className="px-5 py-3">
                        <div className="font-mono text-[12px] font-semibold text-primary">{r.saleNo}{r.status === "voided" && " · VOID"}</div>
                        <div className="text-[11px] text-t4">{fmtTime(r.at)}</div>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-t2 max-w-[220px] truncate">{r.summary}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-t2">
                          <span className="w-5 h-5 rounded-full bg-primary-soft text-primary text-[10px] font-bold flex items-center justify-center">{r.staffName[0]}</span>
                          {r.staffName}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={r.method === "cash" ? "success" : r.method === "pos" ? "brand" : "warning"}>{PAY_LABELS[r.method] || r.method}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(r.total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-[14px] font-bold text-t1 mb-4">Top Products · 7 days</div>
            {m.topProducts.length === 0 ? (
              <div className="text-[12px] text-t4 py-4 text-center">Sales data builds this list.</div>
            ) : (
              <div className="space-y-3">
                {m.topProducts.map((p, i) => {
                  const max = m.topProducts[0].revenue || 1;
                  return (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="flex items-center gap-2 text-[12px] font-medium text-t2 truncate">
                          <span className="w-4 h-4 rounded-full bg-primary-soft text-primary text-[9px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="truncate">{p.name}</span>
                        </span>
                        <span className="text-[11px] font-mono text-t3 shrink-0 ml-2">{p.sold} sold</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden ml-6">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(p.revenue / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <div className="text-[14px] font-bold text-t1">Low Stock</div>
              {m.lowStock.length > 0 && <Badge tone="warning" className="ml-auto">{m.lowStock.length} items</Badge>}
            </div>
            {m.lowStock.length === 0 ? (
              <div className="text-[12px] text-t4 py-2 text-center flex items-center justify-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> All stocked up.
              </div>
            ) : (
              <div className="space-y-2.5">
                {m.lowStock.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-t1 truncate">{s.name}</span>
                    <span className={cn("text-[12px] font-mono font-semibold shrink-0 ml-2", s.stock === 0 ? "text-danger" : "text-warning")}>{s.stock} left</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ── Sales tab ────────────────────────────────────────────────
type SalesReport = {
  days: number;
  totals: { revenue: number; txns: number; avgSale: number; profit?: number; expenses?: number };
  series: { date: string; revenue: number }[];
  byStaff: { name: string; sales: number; revenue: number }[];
  byCategory: { category: string; sold: number; revenue: number }[];
  byMethod: { method: string; amount: number }[];
};

function BarList({ rows, currency }: { rows: { label: string; sub: string; value: number }[]; currency: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-medium text-t2 truncate">{r.label}</span>
            <span className="text-[11px] font-mono text-t3 shrink-0 ml-2">{r.sub} · {fmtMoney(r.value, currency)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SalesTab({ currency, branchKey }: { currency: string; branchKey?: string }) {
  const { data: r, loading } = useApi<SalesReport>("/metrics/sales-report?days=30", [branchKey]);
  if (loading || !r) return <Spinner />;

  const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
  const series = r.series.map((s) => ({ d: dayLabel(s.date), v: s.revenue }));
  const showProfit = r.totals.profit !== undefined;

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-4 mb-6", showProfit ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <StatCard index={0} label={`Revenue · ${r.days} days`} value={fmtMoney(r.totals.revenue, currency)} icon={Wallet} spark={r.series.map((s) => s.revenue)} />
        <StatCard index={1} label="Transactions" value={String(r.totals.txns)} icon={ShoppingCart} />
        <StatCard index={2} label="Average sale" value={fmtMoney(r.totals.avgSale, currency)} icon={Receipt} />
        {showProfit && <StatCard index={3} label="Profit (after expenses)" value={fmtMoney(r.totals.profit!, currency)} icon={TrendingUp} />}
      </div>

      <Card className="p-5 mb-6">
        <div className="text-[14px] font-bold text-t1">Revenue trend</div>
        <div className="text-[12px] text-t3 mb-4">Last {r.days} days</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="rev30" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
                tickFormatter={(v) => (v >= 1000 ? `${currency}${Math.round(v / 1000)}k` : `${currency}${v}`)} />
              <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: "var(--chart-1)", strokeWidth: 1, strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rev30)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">By staff</div>
          {r.byStaff.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">No sales in this window.</div>
          ) : (
            <BarList currency={currency} rows={r.byStaff.map((s) => ({ label: s.name, sub: `${s.sales} sales`, value: s.revenue }))} />
          )}
        </Card>
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">By category</div>
          {r.byCategory.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">No sales in this window.</div>
          ) : (
            <BarList currency={currency} rows={r.byCategory.map((c) => ({ label: c.category, sub: `${c.sold} sold`, value: c.revenue }))} />
          )}
        </Card>
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">By payment method</div>
          {r.byMethod.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">No payments in this window.</div>
          ) : (
            <BarList currency={currency} rows={r.byMethod.map((m) => ({ label: PAY_LABELS[m.method] || m.method, sub: "", value: m.amount }))} />
          )}
        </Card>
      </div>
    </>
  );
}

// ── Expenses tab ─────────────────────────────────────────────
type ExpenseRow = { id: string; type: string; amount: number; notes: string; paidBy: string; actorName: string; at: string };

function ExpensesTab({ currency, branchKey }: { currency: string; branchKey?: string }) {
  const from = todayStr().slice(0, 8) + "01"; // this month
  const { data: r, loading } = useApi<{ expenses: ExpenseRow[]; total: number }>(
    `/expenses?from=${from}&to=${todayStr()}`,
    [branchKey]
  );
  if (loading || !r) return <Spinner />;

  const byType = new Map<string, number>();
  for (const e of r.expenses) byType.set(e.type, (byType.get(e.type) || 0) + e.amount);
  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  const biggest = typeRows[0];

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        <StatCard index={0} label="Spent this month" value={fmtMoney(r.total, currency)} icon={ReceiptText} />
        <StatCard index={1} label="Entries" value={String(r.expenses.length)} icon={Receipt} />
        <StatCard index={2} label={biggest ? `Biggest: ${biggest[0]}` : "Biggest category"} value={biggest ? fmtMoney(biggest[1], currency) : "—"} icon={TrendingUp} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">By type · this month</div>
          {typeRows.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">No expenses recorded this month.</div>
          ) : (
            <div className="space-y-3">
              {typeRows.map(([type, amount]) => {
                const max = typeRows[0][1] || 1;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-t2">{type}</span>
                      <span className="text-[11px] font-mono font-semibold text-t1">{fmtMoney(amount, currency)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(amount / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="p-4 pb-2 text-[14px] font-bold text-t1">Recent entries</div>
          {r.expenses.length === 0 ? (
            <div className="text-[12px] text-t4 py-8 text-center">Record expenses on the Expenses page.</div>
          ) : (
            <div className="divide-y divide-line">
              {r.expenses.slice(0, 8).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-danger-soft text-danger flex items-center justify-center shrink-0">
                    <ReceiptText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-t1">{e.type}</div>
                    <div className="text-[11px] text-t3 truncate">{e.actorName} · {fmtDate(e.at)}</div>
                  </div>
                  <span className="font-mono text-[13px] font-bold text-t1 tabular-nums shrink-0">{fmtMoney(e.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ── Movement tab ─────────────────────────────────────────────
type MovementRow = {
  id: string; productName: string; type: string; qty: number; balanceAfter: number;
  reason: string; actorName: string; at: string;
};

const MOVE_META: Record<string, { label: string; icon: any; tone: "success" | "danger" | "brand" | "warning" | "neutral" }> = {
  IN: { label: "Stock in", icon: ArrowDownToLine, tone: "success" },
  OUT: { label: "Sale", icon: ArrowUpFromLine, tone: "neutral" },
  TRANSFER_IN: { label: "Transfer in", icon: ArrowLeftRight, tone: "brand" },
  TRANSFER_OUT: { label: "Transfer out", icon: ArrowLeftRight, tone: "warning" },
  RETURN: { label: "Return", icon: Undo2, tone: "brand" },
  ADJUST: { label: "Adjustment", icon: Wrench, tone: "warning" },
  VOID_RESTOCK: { label: "Void restock", icon: RotateCcw, tone: "danger" },
};

function MovementTab({ branchKey }: { branchKey?: string }) {
  const [type, setType] = useState("");
  const { data, loading } = useApi<{ movements: MovementRow[] }>(
    `/inventory/movements?limit=60${type ? `&type=${type}` : ""}`,
    [branchKey, type]
  );

  const FILTERS = [
    { key: "", label: "All" },
    { key: "IN", label: "Stock in" },
    { key: "OUT", label: "Sales" },
    { key: "TRANSFER_OUT", label: "Transfers" },
    { key: "RETURN", label: "Returns" },
    { key: "ADJUST", label: "Adjustments" },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="p-4 pb-2 flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[14px] font-bold text-t1">Inventory movement</div>
          <div className="text-[12px] text-t3">Every unit in and out — the ledger, newest first</div>
        </div>
        <div className="flex gap-1.5 ml-auto flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setType(f.key)}
              className={cn("px-2.5 h-7 rounded-full text-[11px] font-semibold border transition-colors",
                type === f.key ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : !data?.movements.length ? (
        <EmptyState icon={ArrowLeftRight} title="No movements" body="Stock-ins, sales, transfers and adjustments appear here as they happen." />
      ) : (
        <div className="divide-y divide-line">
          {data.movements.map((m) => {
            const meta = MOVE_META[m.type] || MOVE_META.ADJUST;
            const Icon = meta.icon;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  m.qty > 0 ? "bg-success-soft text-success" : "bg-surface-3 text-t3")}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-t1 truncate">{m.productName}</div>
                  <div className="text-[11px] text-t3 truncate">
                    <Badge tone={meta.tone} className="mr-1.5">{meta.label}</Badge>
                    {m.reason && `${m.reason} · `}{m.actorName} · {fmtDateTime(m.at)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("font-mono text-[13px] font-bold tabular-nums", m.qty > 0 ? "text-success" : "text-t1")}>
                    {m.qty > 0 ? "+" : ""}{m.qty}
                  </div>
                  <div className="text-[10px] text-t4 font-mono">bal {m.balanceAfter}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Expiry tab ───────────────────────────────────────────────
function ExpiryTab({ branchKey }: { branchKey?: string }) {
  const { data: r, loading } = useApi<{ expiringSoon: { id: string; name: string; stock: number; expiry: string; expired: boolean }[] }>(
    "/metrics/inventory-report",
    [branchKey]
  );
  if (loading || !r) return <Spinner />;
  const expired = r.expiringSoon.filter((e) => e.expired);
  const soon = r.expiringSoon.filter((e) => !e.expired);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-6 xl:grid-cols-3">
        <StatCard index={0} label="Already expired (still in stock)" value={String(expired.length)} icon={AlertTriangle} />
        <StatCard index={1} label="Expiring within 30 days" value={String(soon.length)} icon={CalendarClock} />
      </div>
      <Card className="overflow-hidden">
        <div className="p-4 pb-2 text-[14px] font-bold text-t1">Expiry watchlist</div>
        {r.expiringSoon.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nothing on the watchlist" body="Products with an expiry date within 30 days (and any already expired with stock left) appear here. Set expiry dates when adding or editing products." />
        ) : (
          <div className="divide-y divide-line">
            {r.expiringSoon.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  e.expired ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-t1 truncate">{e.name}</div>
                  <div className="text-[11px] text-t3">{e.stock} in stock</div>
                </div>
                <Badge tone={e.expired ? "danger" : "warning"}>
                  {e.expired ? "EXPIRED" : `expires ${fmtDate(e.expiry)}`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ── Customers tab ────────────────────────────────────────────
type CustomersReport = {
  totals: { customers: number; newLast30: number; activeLast30: number; repeatRate: number };
  topSpenders: { id: string; name: string; phone: string; totalSpend: number; visits: number }[];
  newest: { id: string; name: string; phone: string; totalSpend: number; visits: number; firstSeen: string }[];
};

function CustomersTab({ currency, branchKey }: { currency: string; branchKey?: string }) {
  const { data: r, loading } = useApi<CustomersReport>("/metrics/customers-report", [branchKey]);
  if (loading || !r) return <Spinner />;

  return (
    <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard index={0} label="Customers on file" value={String(r.totals.customers)} icon={Users} />
        <StatCard index={1} label="New · last 30 days" value={String(r.totals.newLast30)} icon={Users} />
        <StatCard index={2} label="Active · last 30 days" value={String(r.totals.activeLast30)} icon={ShoppingCart} />
        <StatCard index={3} label="Come back to buy again" value={`${r.totals.repeatRate}%`} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">Top spenders</div>
          {r.topSpenders.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">Attach customers on the POS to build this list.</div>
          ) : (
            <div className="divide-y divide-line">
              {r.topSpenders.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary-soft text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-t1 truncate">{c.name}</div>
                    <div className="text-[11px] text-t3">{c.phone || "no phone"} · {c.visits} visit{c.visits === 1 ? "" : "s"}</div>
                  </div>
                  <span className="font-mono text-[13px] font-bold text-t1 tabular-nums shrink-0">{fmtMoney(c.totalSpend, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">Newest customers</div>
          {r.newest.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">New customers appear here as they're added.</div>
          ) : (
            <div className="divide-y divide-line">
              {r.newest.map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold text-[12px] flex items-center justify-center shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-t1 truncate">{c.name}</div>
                    <div className="text-[11px] text-t3">first seen {new Date(c.firstSeen).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</div>
                  </div>
                  <span className="font-mono text-[12px] text-t2 tabular-nums shrink-0">{fmtMoney(c.totalSpend, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ── Staff tab ────────────────────────────────────────────────
type StaffReport = {
  days: number;
  staff: { name: string; sales: number; voids: number; revenue: number; discounts: number; avgSale: number; hours: number; shifts: number }[];
};

function StaffTab({ currency, branchKey }: { currency: string; branchKey?: string }) {
  const { data: r, loading } = useApi<StaffReport>("/metrics/staff-report", [branchKey]);
  if (loading || !r) return <Spinner />;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-3">
        <div className="text-[14px] font-bold text-t1">Staff performance · last {r.days} days</div>
        <div className="text-[12px] text-t3">Sales, discounts given, voids and hours — per person</div>
      </div>
      {r.staff.length === 0 ? (
        <EmptyState icon={UserCog} title="No staff activity yet" body="Sales and clock-ins over the last 30 days appear here per person." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left">
                {["Staff", "Sales", "Revenue", "Avg sale", "Discounts", "Voids", "Hours"].map((h, i) => (
                  <th key={h} className={cn("px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-t4 border-y border-line", i > 0 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.staff.map((s) => (
                <tr key={s.name} className="hover:bg-surface-2 transition-colors border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-t1">
                      <span className="w-6 h-6 rounded-full bg-primary-soft text-primary text-[10px] font-bold flex items-center justify-center">{s.name[0]}</span>
                      {s.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[13px] text-t1 tabular-nums">{s.sales}</td>
                  <td className="px-5 py-3 text-right font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(s.revenue, currency)}</td>
                  <td className="px-5 py-3 text-right font-mono text-[12px] text-t2 tabular-nums">{s.avgSale ? fmtMoney(s.avgSale, currency) : "—"}</td>
                  <td className="px-5 py-3 text-right font-mono text-[12px] text-t2 tabular-nums">{s.discounts ? fmtMoney(s.discounts, currency) : "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {s.voids > 0 ? <Badge tone="danger">{s.voids}</Badge> : <span className="text-[12px] text-t4">0</span>}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[12px] text-t2 tabular-nums">{s.hours ? `${s.hours.toFixed(1)}h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Inventory tab ────────────────────────────────────────────
type InventoryReport = {
  skus: number; units: number; retailValue: number; costValue?: number; potentialProfit?: number;
  flow30d: { unitsIn: number; unitsOut: number };
  topMovers: { id: string; name: string; unitsIn: number; unitsOut: number }[];
  lowStock: { id: string; name: string; stock: number; reorderLevel: number }[];
  expiringSoon: { id: string; name: string; stock: number; expiry: string; expired: boolean }[];
};

function InventoryTab({ currency, branchKey }: { currency: string; branchKey?: string }) {
  const { hasModule } = useSession();
  const { data: r, loading } = useApi<InventoryReport>("/metrics/inventory-report", [branchKey]);
  if (loading || !r) return <Spinner />;

  const showCost = r.costValue !== undefined;
  const showExpiry = hasModule("expiry");

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-4 mb-6", showCost ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <StatCard index={0} label="Products in catalog" value={String(r.skus)} icon={Boxes} />
        <StatCard index={1} label="Units on shelf" value={r.units.toLocaleString()} icon={Package} />
        <StatCard index={2} label="Stock value (retail)" value={fmtMoney(r.retailValue, currency)} icon={Wallet} />
        {showCost && <StatCard index={3} label="Profit sitting on the shelf" value={fmtMoney(r.potentialProfit!, currency)} icon={TrendingUp} />}
      </div>

      {/* In & Out — the flow through the shelf, last 30 days */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">In & Out · last 30 days</div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-success-soft">
              <ArrowDownToLine className="w-5 h-5 text-success shrink-0" />
              <div>
                <div className="font-mono text-[20px] font-bold text-success leading-none tabular-nums">{r.flow30d.unitsIn.toLocaleString()}</div>
                <div className="text-[11px] font-medium text-t3 mt-1">units came in (stock-ins, returns, transfers in)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-2 border border-line">
              <ArrowUpFromLine className="w-5 h-5 text-t2 shrink-0" />
              <div>
                <div className="font-mono text-[20px] font-bold text-t1 leading-none tabular-nums">{r.flow30d.unitsOut.toLocaleString()}</div>
                <div className="text-[11px] font-medium text-t3 mt-1">units went out (sales, transfers out)</div>
              </div>
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2 p-5">
          <div className="text-[14px] font-bold text-t1 mb-4">Fastest movers · units out, last 30 days</div>
          {r.topMovers.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">Movement builds this list as you sell and restock.</div>
          ) : (
            <div className="space-y-3">
              {r.topMovers.slice(0, 6).map((m) => {
                const max = r.topMovers[0].unitsOut || 1;
                return (
                  <div key={m.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium text-t2 truncate">{m.name}</span>
                      <span className="text-[11px] font-mono text-t3 shrink-0 ml-2">
                        <span className="text-success">+{m.unitsIn}</span> in · <span className="text-t1 font-semibold">−{m.unitsOut}</span> out
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-400" style={{ width: `${(m.unitsOut / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className={cn("grid grid-cols-1 gap-4", showExpiry && "lg:grid-cols-2")}>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <div className="text-[14px] font-bold text-t1">Needs reordering</div>
            {r.lowStock.length > 0 && <Badge tone="warning" className="ml-auto">{r.lowStock.length}</Badge>}
          </div>
          {r.lowStock.length === 0 ? (
            <div className="text-[12px] text-t4 py-4 text-center">Everything is above its reorder level.</div>
          ) : (
            <div className="space-y-2.5">
              {r.lowStock.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-t1 truncate">{s.name}</span>
                  <span className={cn("text-[12px] font-mono font-semibold shrink-0 ml-2", s.stock === 0 ? "text-danger" : "text-warning")}>
                    {s.stock} left · reorder at {s.reorderLevel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {showExpiry && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="w-4 h-4 text-danger" />
              <div className="text-[14px] font-bold text-t1">Expiring within 30 days</div>
              {r.expiringSoon.length > 0 && <Badge tone="danger" className="ml-auto">{r.expiringSoon.length}</Badge>}
            </div>
            {r.expiringSoon.length === 0 ? (
              <div className="text-[12px] text-t4 py-4 text-center">Nothing close to expiry. Set expiry dates on products to track this.</div>
            ) : (
              <div className="space-y-2.5">
                {r.expiringSoon.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-t1 truncate">{s.name}</span>
                    <span className={cn("text-[12px] font-mono font-semibold shrink-0 ml-2", s.expired ? "text-danger" : "text-warning")}>
                      {s.expired ? "EXPIRED" : new Date(s.expiry).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} · {s.stock} in stock
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
