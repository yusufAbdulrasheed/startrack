import {
  Wallet,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Download,
  ArrowUpRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const revenue7d = [
  { d: "Mon", v: 182000 }, { d: "Tue", v: 214000 }, { d: "Wed", v: 168000 },
  { d: "Thu", v: 243000 }, { d: "Fri", v: 291000 }, { d: "Sat", v: 336000 },
  { d: "Sun", v: 248500 },
];

const payments = [
  { name: "Cash", value: 141000, color: "var(--chart-1)" },
  { name: "POS", value: 74500, color: "var(--chart-2)" },
  { name: "Transfer", value: 33000, color: "var(--chart-3)" },
];

const topProducts = [
  { name: "Golden Penny Semovita 2kg", sold: 84, revenue: 168000 },
  { name: "Peak Milk 400g", sold: 62, revenue: 93000 },
  { name: "Indomie Chicken (carton)", sold: 41, revenue: 143500 },
  { name: "Kings Oil 5L", sold: 28, revenue: 210000 },
  { name: "Dangote Sugar 1kg", sold: 24, revenue: 21600 },
];

const recent = [
  { id: "TF-4821", items: "Semovita, Peak Milk +2", amount: 12400, pay: "Cash", staff: "Amaka", time: "2:14 PM" },
  { id: "TF-4820", items: "Kings Oil 5L", amount: 7500, pay: "Transfer", staff: "Chidi", time: "2:02 PM" },
  { id: "TF-4819", items: "Indomie carton", amount: 3500, pay: "POS", staff: "Amaka", time: "1:47 PM" },
  { id: "TF-4818", items: "Sugar, Salt, Maggi +5", amount: 9800, pay: "Cash", staff: "Ngozi", time: "1:31 PM" },
  { id: "TF-4817", items: "Peak Milk 400g ×3", amount: 4500, pay: "POS", staff: "Chidi", time: "1:12 PM" },
];

const lowStock = [
  { name: "Kings Oil 5L", stock: 3, reorder: 10 },
  { name: "Dangote Sugar 1kg", stock: 5, reorder: 15 },
  { name: "Golden Penny Flour", stock: 2, reorder: 12 },
  { name: "Titus Sardine", stock: 6, reorder: 20 },
];

const naira = (n: number) => "₦" + n.toLocaleString("en-NG");

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-surface border border-line-2 shadow-e2 px-3 py-2">
      <div className="text-[11px] font-semibold text-t3 mb-0.5">{label}</div>
      <div className="text-[14px] font-bold font-mono text-t1">{naira(payload[0].value)}</div>
    </div>
  );
}

export function Dashboard() {
  const { session, activeBusiness, activeBranch } = useSession();
  const firstName = session?.user.name.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
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
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 h-10 px-3 rounded-ctl border border-line-2 bg-surface text-[13px] font-medium text-t2">
            <Calendar className="w-4 h-4 text-t3" /> Last 7 days
          </div>
          <Button variant="secondary" size="md"><RefreshCw className="w-4 h-4" /> Refresh</Button>
          <Button variant="secondary" size="md" className="!px-2.5"><Download className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard index={0} label="Today's Revenue" value="₦248,500" delta="12%" trend="up" icon={Wallet} spark={[120, 145, 130, 180, 160, 210, 248]} />
        <StatCard index={1} label="Transactions" value="37" delta="5%" trend="up" icon={ShoppingCart} spark={[22, 28, 25, 31, 29, 35, 37]} />
        <StatCard index={2} label="Est. Profit" value="₦61,300" delta="3%" trend="down" icon={TrendingUp} spark={[70, 64, 66, 58, 62, 60, 61]} />
        <StatCard index={3} label="Low Stock Items" value="4" delta="needs action" trend="down" icon={AlertTriangle} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Revenue area — single brand hue, no legend (title names it), hover crosshair */}
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[14px] font-bold text-t1">Revenue</div>
              <div className="text-[12px] text-t3">Last 7 days · daily</div>
            </div>
            <Badge tone="success"><ArrowUpRight className="w-3 h-3" /> 12% vs last week</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue7d} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} width={48} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => "₦" + v / 1000 + "k"} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--chart-1)", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Area type="monotone" dataKey="v" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#rev)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--st-surface)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Payment split — validated categorical, legend + direct labels (amber needs label) */}
        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1">Payment Methods</div>
          <div className="text-[12px] text-t3 mb-5">Share of today's revenue</div>
          <div className="space-y-4">
            {payments.map((p) => {
              const total = payments.reduce((s, x) => s + x.value, 0);
              const pct = Math.round((p.value / total) * 100);
              return (
                <div key={p.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-t2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
                      {p.name}
                    </span>
                    <span className="text-[12px] font-mono font-semibold text-t1 tabular-nums">
                      {pct}% · {naira(p.value)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: p.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
            <span className="text-[12px] text-t3">Total today</span>
            <span className="text-[15px] font-bold font-mono text-t1">{naira(payments.reduce((s, x) => s + x.value, 0))}</span>
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent transactions */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <div className="text-[14px] font-bold text-t1">Recent Sales</div>
            <button className="text-[12px] font-semibold text-primary hover:underline">View all</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left">
                {["Receipt", "Items", "Staff", "Method", "Amount"].map((h, i) => (
                  <th key={h} className={cn("px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-t4 border-y border-line", i === 4 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2 transition-colors border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <div className="font-mono text-[12px] font-semibold text-primary">{r.id}</div>
                    <div className="text-[11px] text-t4">{r.time}</div>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-t2 max-w-[200px] truncate">{r.items}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-t2">
                      <span className="w-5 h-5 rounded-full bg-primary-soft text-primary text-[10px] font-bold flex items-center justify-center">{r.staff[0]}</span>
                      {r.staff}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={r.pay === "Cash" ? "success" : r.pay === "POS" ? "brand" : "warning"}>{r.pay}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-[13px] font-bold text-t1 tabular-nums">{naira(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Right column: top products + low stock */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="text-[14px] font-bold text-t1 mb-4">Top Products</div>
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const max = topProducts[0].revenue;
                return (
                  <div key={p.name}>
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
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <div className="text-[14px] font-bold text-t1">Low Stock</div>
              <Badge tone="warning" className="ml-auto">{lowStock.length} items</Badge>
            </div>
            <div className="space-y-2.5">
              {lowStock.map((s) => (
                <div key={s.name} className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-t1 truncate">{s.name}</span>
                  <span className="text-[12px] font-mono font-semibold text-danger shrink-0 ml-2">{s.stock} left</span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full mt-4">Reorder list</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
