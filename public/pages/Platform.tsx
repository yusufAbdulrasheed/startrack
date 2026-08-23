import { useState } from "react";
import {
  Globe2, Building2, Users, Receipt, Search, ShieldAlert, ShieldCheck,
  TrendingUp, Activity, FlaskConical, ChevronRight, Ban, Play,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Pager, ROWS_PER_PAGE } from "@/components/ui/Pager";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Overview = {
  viewer: { name: string; platformRole: string };
  totals: {
    accounts: number; sandboxes: number; businesses: number; users: number; branches: number;
    newAccounts30d: number; activeBusinesses7d: number; revenue30d: number; txns30d: number;
  };
  byType: { typeKey: string; label: string; count: number }[];
  byPlan: Record<string, number>;
};
type Account = {
  id: string; name: string; plan: string; status: string; isSandbox: boolean; createdAt: string;
  owner: { name: string; email: string } | null;
  businesses: { id: string; name: string; typeLabel: string }[];
  revenue: number; txns: number; lastSaleAt: string | null;
};

export function Platform() {
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: ov, loading } = useApi<Overview>("/platform/overview", []);
  const { data: list, reload } = useApi<{ accounts: Account[]; page: number; pages: number; total: number }>(
    `/platform/accounts?limit=${ROWS_PER_PAGE}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    []
  );

  const isOverseer = session?.platformRole === "overseer";

  if (loading) return <div className="p-8"><Spinner /></div>;
  if (!ov) {
    return (
      <div className="p-8">
        <Card className="p-10 text-center">
          <ShieldAlert className="w-10 h-10 text-t4 mx-auto mb-3" />
          <div className="text-[14px] font-bold text-t1">No platform access</div>
          <div className="text-[12px] text-t3 mt-1">This console is for StarTrack staff.</div>
        </Card>
      </div>
    );
  }

  const t = ov.totals;
  const topType = ov.byType[0];

  return (
    <div className="p-6 lg:p-8 max-w-[1300px] mx-auto">
      {/* This console looks across every tenant, so it gets its own dark
          header — a standing reminder you are not inside one shop. */}
      <div className="relative overflow-hidden rounded-card mb-5 p-6" style={{ background: "var(--st-ink)" }}>
        <div aria-hidden className="absolute inset-0 opacity-60">
          <div className="absolute -top-24 right-10 w-[320px] h-[320px] rounded-full blur-3xl animate-drift" style={{ background: "radial-gradient(circle, rgba(0,88,190,.5), transparent 70%)" }} />
        </div>
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-white/70" />
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">StarTrack Platform</span>
            </div>
            <h1 className="font-display font-extrabold text-white text-[26px] tracking-tight mt-1.5">
              Every business on the platform
            </h1>
            <p className="text-white/55 text-[13px] mt-1">
              Signed in as {ov.viewer.name} · {ov.viewer.platformRole === "overseer" ? "full overseer" : "read-only support"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-[11px] font-bold",
              isOverseer ? "bg-white/15 text-white" : "bg-white/10 text-white/70"
            )}>
              {isOverseer ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
              {isOverseer ? "Overseer" : "Support"}
            </span>
          </div>
        </div>

        <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {[
            { label: "Accounts", value: String(t.accounts), sub: `+${t.newAccounts30d} in 30 days`, icon: Building2 },
            { label: "Businesses", value: String(t.businesses), sub: `${t.branches} branches`, icon: Globe2 },
            { label: "Trading this week", value: String(t.activeBusinesses7d), sub: `of ${t.businesses}`, icon: Activity },
            { label: "Volume · 30 days", value: fmtMoney(t.revenue30d, "₦"), sub: `${t.txns30d.toLocaleString()} sales`, icon: TrendingUp },
          ].map((s) => (
            <div key={s.label} className="rounded-ctl bg-white/[0.07] border border-white/10 backdrop-blur px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-white/50 text-[10px] font-bold uppercase tracking-wide">
                <s.icon className="w-3 h-3" /> {s.label}
              </div>
              <div className="font-mono font-extrabold text-[20px] text-white tabular-nums mt-1 truncate">{s.value}</div>
              <div className="text-[11px] text-white/40 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[14px] font-bold text-t1">Trades on the platform</div>
            <span className="text-[11px] text-t3">{ov.byType.length} of 26 in use</span>
          </div>
          <div className="space-y-2">
            {ov.byType.slice(0, 7).map((row) => (
              <div key={row.typeKey} className="flex items-center gap-3">
                <span className="text-[12px] text-t2 w-[150px] shrink-0 truncate">{row.label}</span>
                <span className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${Math.max(3, (row.count / (topType?.count || 1)) * 100)}%` }}
                  />
                </span>
                <span className="text-[12px] font-mono font-semibold text-t1 tabular-nums w-8 text-right">{row.count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-[14px] font-bold text-t1 mb-3">Mix</div>
          <div className="space-y-2.5">
            {Object.entries(ov.byPlan).map(([plan, n]) => (
              <div key={plan} className="flex items-center justify-between">
                <span className="text-[12px] text-t2 capitalize">{plan} plan</span>
                <span className="text-[13px] font-mono font-bold text-t1 tabular-nums">{n}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2.5 border-t border-line">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-t3">
                <FlaskConical className="w-3.5 h-3.5" /> Live demo sandboxes
              </span>
              <span className="text-[13px] font-mono font-bold text-t3 tabular-nums">{t.sandboxes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-t3">
                <Users className="w-3.5 h-3.5" /> People with logins
              </span>
              <span className="text-[13px] font-mono font-bold text-t3 tabular-nums">{t.users}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
          <div className="text-[14px] font-bold text-t1">Tenants</div>
          <div className="relative ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search accounts…" className="!w-56 !pl-9" />
          </div>
        </div>

        {!list ? (
          <div className="py-10"><Spinner /></div>
        ) : list.accounts.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-t3">No accounts match that.</div>
        ) : (
          <>
            <div className="divide-y divide-line">
              {list.accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setOpenId(a.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors"
                >
                  <span className={cn(
                    "w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[13px] font-bold",
                    a.status === "suspended" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"
                  )}>
                    {a.name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-semibold text-t1 truncate">{a.name}</span>
                      {a.status === "suspended" && <Badge tone="danger">Suspended</Badge>}
                      <Badge tone="neutral">{a.plan}</Badge>
                    </div>
                    <div className="text-[11.5px] text-t3 truncate">
                      {a.owner?.email || "—"} · {a.businesses.length} business{a.businesses.length === 1 ? "" : "es"}
                      {a.businesses[0] ? ` · ${a.businesses[0].typeLabel}` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(a.revenue, "₦")}</div>
                    <div className="text-[10.5px] text-t4">{a.lastSaleAt ? `last sale ${fmtDate(a.lastSaleAt)}` : "no sales yet"}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-t4 shrink-0" />
                </button>
              ))}
            </div>
            <Pager
              page={list.page} pages={list.pages} total={list.total}
              from={(list.page - 1) * ROWS_PER_PAGE + 1}
              to={(list.page - 1) * ROWS_PER_PAGE + list.accounts.length}
              onPage={setPage} noun="accounts"
            />
          </>
        )}
      </Card>

      <TenantDetail id={openId} canAct={isOverseer} onClose={() => setOpenId(null)} onChanged={reload} />
    </div>
  );
}

type Detail = {
  account: { id: string; name: string; plan: string; status: string; isSandbox: boolean; createdAt: string };
  businesses: { id: string; name: string; typeLabel: string; capabilities: string[]; currency: string }[];
  people: { id: string; name: string; email: string; status: string; role: string }[];
  usage: { products: number; revenue: number; txns: number; lastSaleAt: string | null };
};

function TenantDetail({ id, canAct, onClose, onChanged }: {
  id: string | null; canAct: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data, loading, reload } = useApi<Detail>(id ? `/platform/accounts/${id}` : null, [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!id) return null;

  const d = data;

  async function setStatus(status: "active" | "suspended") {
    setBusy(true); setError("");
    try {
      await api(`/platform/accounts/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      reload(); onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!id} onClose={onClose} title={d?.account.name || "Tenant"} subtitle={d ? `Joined ${fmtDate(d.account.createdAt)}` : ""} wide>
      {loading || !d ? (
        <div className="py-10"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <ErrorBanner message={error} />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              ["Revenue", fmtMoney(d.usage.revenue, "₦")],
              ["Sales", d.usage.txns.toLocaleString()],
              ["Products", String(d.usage.products)],
              ["People", String(d.people.length)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-ctl bg-surface-2 border border-line px-3 py-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-t4">{l}</div>
                <div className="font-mono font-bold text-[15px] text-t1 tabular-nums truncate">{v}</div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-[12px] font-bold text-t1 mb-2">Businesses</div>
            <div className="space-y-2">
              {d.businesses.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded-ctl bg-surface-2 border border-line">
                  <Receipt className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-t1 truncate">{b.name}</div>
                    <div className="text-[11px] text-t3">{b.typeLabel}</div>
                  </div>
                  {b.capabilities.slice(0, 3).map((c) => (
                    <span key={c} className="hidden sm:inline text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary-soft text-primary">{c}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-t1 mb-2">People</div>
            <div className="rounded-ctl border border-line overflow-hidden">
              {d.people.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-line last:border-0">
                  <span className="text-[12.5px] text-t1 flex-1 truncate">{p.name}</span>
                  <span className="text-[11px] text-t3 truncate hidden sm:block">{p.email}</span>
                  <Badge tone="neutral">{p.role}</Badge>
                </div>
              ))}
            </div>
          </div>

          {canAct && !d.account.isSandbox && (
            <div className="flex items-center gap-2 pt-2 border-t border-line">
              {d.account.status === "active" ? (
                <Button variant="danger" onClick={() => setStatus("suspended")} disabled={busy}>
                  <Ban className="w-4 h-4" /> Suspend account
                </Button>
              ) : (
                <Button variant="success" onClick={() => setStatus("active")} disabled={busy}>
                  <Play className="w-4 h-4" /> Restore account
                </Button>
              )}
              <span className="text-[11px] text-t4">Recorded in this tenant's own audit trail.</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
