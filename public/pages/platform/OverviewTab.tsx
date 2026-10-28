import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CircleSlash, LifeBuoy, ChevronRight, ArrowUpRight, Building2 } from "lucide-react";
import { Spinner } from "@/components/ui/EmptyState";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { AreaChart, Avatar, BarChart, Donut, EmptyBlock, Panel, Pill, RowButton, Sparkline, naira } from "./ui";
import type { Overview } from "./types";

type Growth = { days: number; series: { date: string; signups: number; volume: number; txns: number }[] };
type Subs = { counts: { paid: number; trialing: number; lapsed: number }; expiring: unknown[]; lapsed: unknown[] };
type Recent = { accounts: { id: string; name: string; plan: string; status: string; createdAt: string; owner: { email: string } | null; businesses: { typeLabel: string }[] }[] };

const PLAN_COLOR: Record<string, string> = {
  free: "var(--st-text-4)",
  pro: "var(--st-primary)",
  business: "var(--st-amber)",
};
const PLAN_LABEL: Record<string, string> = { free: "Freemium", pro: "Pro", business: "Business" };
const RANGES = ["14", "30", "90"] as const;
const MINT = "#46d9a0";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Percentage ring used by the "trading this week" tile. */
function Ring({ pct }: { pct: number }) {
  const r = 38, c = 2 * Math.PI * r;
  return (
    <div className="relative w-[104px] h-[104px] shrink-0">
      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90" role="img" aria-label={`${pct}% of businesses traded this week`}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--st-surface-3)" strokeWidth="10" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--st-primary)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(Math.max(pct, 2) / 100) * c} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-display text-[24px] font-semibold text-t1 tabular-nums">{pct}%</div>
    </div>
  );
}

/** The overview is a bento grid: one dominant volume card flanked by two tiles, then supporting panels. */
export function OverviewTab({ ov, onOpenAccount }: { ov: Overview; onOpenAccount: (id: string) => void }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>("30");
  const { data: growth } = useApi<Growth>(`/platform/growth?days=${days}`, []);
  const { data: subs } = useApi<Subs>("/platform/subscriptions", []);
  const { data: open } = useApi<{ total: number }>("/platform/tickets?status=open&limit=1", []);
  const { data: recent } = useApi<Recent>("/platform/accounts?limit=6", []);

  const t = ov.totals;
  const series = growth?.series ?? [];
  const labels = series.map((d) => fmtDate(d.date));
  const volume = series.reduce((s, d) => s + d.volume, 0);
  const sales = series.reduce((s, d) => s + d.txns, 0);
  const signups = series.reduce((s, d) => s + d.signups, 0);
  const topType = ov.byType[0];
  const tradingPct = t.businesses ? Math.round((t.activeBusinesses7d / t.businesses) * 100) : 0;

  const planSegments = Object.entries(ov.byPlan).map(([k, v]) => ({ label: PLAN_LABEL[k] || k, value: v, color: PLAN_COLOR[k] || "var(--st-text-3)" }));
  const planTotal = planSegments.reduce((s, x) => s + x.value, 0);

  const attention = [
    { icon: CalendarClock, tone: "warning", label: "Renewing soon", hint: "Ending within 14 days", count: subs?.expiring.length ?? 0, to: "/admin/subscriptions" },
    { icon: CircleSlash, tone: "danger", label: "Lapsed", hint: "Dropped back to Freemium", count: subs?.lapsed.length ?? 0, to: "/admin/subscriptions" },
    { icon: LifeBuoy, tone: "brand", label: "Open tickets", hint: "Waiting on StarTrack", count: open?.total ?? 0, to: "/admin/support" },
  ] as const;
  const toneCls = { warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", brand: "bg-primary-soft text-primary" };

  return (
    <div className="p-4 sm:p-6 lg:p-8 lg:pt-2 max-w-[1440px] mx-auto animate-fade-up">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.14em] text-t3">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="font-display text-[36px] leading-[1.1] font-semibold text-t1 mt-1.5">{greeting()}, {ov.viewer.name.split(" ")[0]}</h1>
        </div>
        <div className="inline-flex p-1 rounded-full bg-surface border border-line shadow-e1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r} onClick={() => setDays(r)} aria-pressed={days === r}
              className={`h-8 px-4 rounded-full text-[12.5px] font-semibold transition-colors ${days === r ? "bg-nav text-white" : "text-t3 hover:text-t1"}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Volume — the dominant tile */}
        <section className="col-span-12 lg:col-span-8 lg:row-span-2 relative overflow-hidden rounded-[28px] p-6 lg:p-8 text-white flex flex-col" style={{ background: "var(--st-nav-bg)" }}>
          <div aria-hidden className="absolute -top-28 -right-16 w-[420px] h-[420px] rounded-full blur-3xl opacity-60 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(240,177,63,.35), transparent 70%)" }} />
          <div aria-hidden className="absolute -bottom-40 -left-20 w-[420px] h-[420px] rounded-full blur-3xl opacity-60 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(70,217,160,.28), transparent 70%)" }} />

          <div className="relative">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-white/60">
              Trading volume · last {days} days
              <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full bg-white/10 text-[10.5px] font-bold uppercase tracking-wider text-white/70">All businesses</span>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap mt-2">
              <span className="font-display text-[52px] lg:text-[60px] leading-none font-semibold tabular-nums">{naira(volume)}</span>
            </div>
            <div className="text-[13px] text-white/55 mt-2">{sales.toLocaleString()} sales processed across {t.businesses.toLocaleString()} businesses</div>
          </div>

          <div className="relative mt-6 flex-1 min-h-[230px]">
            {growth ? (
              <AreaChart dark values={series.map((d) => d.volume)} labels={labels} color={MINT} format={naira} height={240} />
            ) : (
              <div className="h-[240px] grid place-items-center"><Spinner /></div>
            )}
            {growth && <div className="flex justify-between text-[11px] text-white/40 mt-2"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
          </div>

          <div className="relative grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/10">
            {[
              ["Businesses", t.businesses.toLocaleString()],
              ["Branches", t.branches.toLocaleString()],
              ["People with logins", t.users.toLocaleString()],
            ].map(([l, v]) => (
              <div key={l}>
                <div className="text-[11.5px] text-white/50">{l}</div>
                <div className="font-display text-[24px] font-semibold tabular-nums mt-0.5">{v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Accounts tile */}
        <section
          className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-[28px] p-6 border overflow-hidden"
          style={{ background: "color-mix(in srgb, var(--st-amber) 24%, var(--st-surface))", borderColor: "color-mix(in srgb, var(--st-amber) 40%, var(--st-border))" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-t2">Customer accounts</span>
            <Pill tone="success" dot>+{t.newAccounts30d} in 30 days</Pill>
          </div>
          <div className="font-display text-[52px] leading-none font-semibold text-t1 tabular-nums mt-4">{t.accounts.toLocaleString()}</div>
          <div className="text-[12.5px] text-t2 mt-2">{signups} joined in the last {days} days</div>
          <div className="mt-4 -mx-1"><Sparkline values={series.map((d) => d.signups)} color="var(--st-warning)" className="!h-12" /></div>
        </section>

        {/* Trading ring */}
        <section
          className="col-span-12 sm:col-span-6 lg:col-span-4 rounded-[28px] p-6 border flex items-center gap-5"
          style={{ background: "color-mix(in srgb, var(--st-primary) 9%, var(--st-surface))", borderColor: "color-mix(in srgb, var(--st-primary) 22%, var(--st-border))" }}
        >
          <Ring pct={tradingPct} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-t2">Trading this week</div>
            <div className="font-display text-[34px] leading-none font-semibold text-t1 tabular-nums mt-1.5">{t.activeBusinesses7d}<span className="text-t3 text-[18px]"> / {t.businesses}</span></div>
            <div className="text-[12.5px] text-t2 mt-1.5">businesses made at least one sale</div>
          </div>
        </section>

        <Panel title="Needs attention" subtitle="Where a person could help today" flush className="col-span-12 md:col-span-6 lg:col-span-4">
          <div className="divide-y divide-line">
            {attention.map((a) => (
              <Link key={a.label} to={a.to} className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-surface-2 transition-colors">
                <span className={`grid place-items-center w-9 h-9 rounded-xl shrink-0 ${toneCls[a.tone]}`}><a.icon className="w-4 h-4" strokeWidth={1.9} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-t1 truncate">{a.label}</div>
                  <div className="text-[11.5px] text-t3 truncate">{a.hint}</div>
                </div>
                <span className="font-display text-[22px] font-semibold text-t1 tabular-nums">{a.count}</span>
                <ChevronRight className="w-4 h-4 text-t4" />
              </Link>
            ))}
            <div className="px-5 py-3.5 flex items-center gap-2 flex-wrap">
              <Pill tone="success" dot>{subs?.counts.paid ?? 0} paying</Pill>
              <Pill tone="brand" dot>{subs?.counts.trialing ?? 0} on trial</Pill>
            </div>
          </div>
        </Panel>

        <Panel
          className="col-span-12 md:col-span-6 lg:col-span-5" title="Newest customers" subtitle="The latest accounts to join" flush
          action={<Link to="/admin/accounts" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">View all <ArrowUpRight className="w-3.5 h-3.5" /></Link>}
        >
          {!recent ? <div className="py-10"><Spinner /></div> : recent.accounts.length === 0 ? (
            <EmptyBlock icon={Building2} title="No customers yet" hint="New sign-ups will appear here." />
          ) : (
            <div className="divide-y divide-line">
              {recent.accounts.map((a) => (
                <RowButton key={a.id} onClick={() => onOpenAccount(a.id)} className="!py-3">
                  <Avatar name={a.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-t1 truncate">{a.name}</div>
                    <div className="text-[12px] text-t3 truncate">{a.businesses[0]?.typeLabel || a.owner?.email || "—"}</div>
                  </div>
                  <Pill tone={a.status === "suspended" ? "danger" : "neutral"}>{a.status === "suspended" ? "Suspended" : a.plan}</Pill>
                  <span className="text-[11.5px] text-t3 w-[72px] text-right hidden xl:block">{fmtDate(a.createdAt)}</span>
                </RowButton>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="col-span-12 lg:col-span-3" title="Plan mix" subtitle="Customer accounts by plan">
          <div className="flex flex-col items-center gap-4">
            <Donut size={150} segments={planSegments} centre={<div><div className="font-display text-[28px] font-semibold text-t1 leading-none tabular-nums">{planTotal}</div><div className="text-[11px] text-t3 mt-1">accounts</div></div>} />
            <ul className="w-full space-y-2">
              {planSegments.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-t2 flex-1 truncate">{s.label}</span>
                  <span className="font-semibold text-t1 tabular-nums">{s.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel className="col-span-12 lg:col-span-6" title="Trades on the platform" subtitle={`${ov.byType.length} trades in use`}>
          <div className="space-y-3">
            {ov.byType.slice(0, 6).map((row) => (
              <div key={row.typeKey}>
                <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                  <span className="text-t2 font-medium truncate pr-3">{row.label}</span>
                  <span className="font-semibold text-t1 tabular-nums">{row.count}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, (row.count / (topType?.count || 1)) * 100)}%`, background: "var(--st-gradient-primary)" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-12 lg:col-span-6" title="New accounts" subtitle={`${signups} in the last ${days} days`}>
          {growth ? <BarChart values={series.map((d) => d.signups)} labels={labels} height={190} color="var(--st-primary)" /> : <div className="h-[190px] grid place-items-center"><Spinner /></div>}
        </Panel>
      </div>
    </div>
  );
}
