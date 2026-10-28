import { useEffect, useState } from "react";
import { Ban, Play, X, Store, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { fmtDate } from "@/lib/format";
import { Avatar, Pill, naira } from "./ui";

type Detail = {
  account: { id: string; name: string; plan: string; legacy?: boolean; periodEnd?: string | null; status: string; isSandbox: boolean; createdAt: string };
  businesses: { id: string; name: string; typeLabel: string; capabilities: string[]; currency: string }[];
  people: { id: string; name: string; email: string; status: string; role: string }[];
  usage: { products: number; revenue: number; txns: number; lastSaleAt: string | null };
};

/** Slide-over with everything about one customer, and the actions an overseer may take. */
export function TenantDrawer({ id, canAct, onClose, onChanged }: {
  id: string | null; canAct: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data: d, loading, reload } = useApi<Detail>(id ? `/platform/accounts/${id}` : null, [id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planPick, setPlanPick] = useState("pro");
  const [planDays, setPlanDays] = useState("30");

  useEffect(() => {
    if (!id) return;
    setError("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, onClose]);

  if (!id) return null;

  async function act(path: string, body: unknown) {
    setBusy(true); setError("");
    try {
      await api(`/platform/accounts/${id}/${path}`, { method: "POST", body: JSON.stringify(body) });
      reload(); onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const suspended = d?.account.status === "suspended";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Account details">
      <button className="flex-1 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-label="Close" />
      <aside className="w-full max-w-[520px] h-full bg-surface border-l border-line shadow-e2 flex flex-col animate-fade-in">
        <header className="shrink-0 flex items-start gap-3.5 px-6 py-5 border-b border-line">
          {d ? <Avatar name={d.account.name} size={46} /> : <div className="w-[46px] h-[46px] rounded-xl bg-surface-3" />}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[19px] font-semibold text-t1 truncate">{d?.account.name || "Loading…"}</h2>
            {d && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Pill tone={suspended ? "danger" : "success"} dot>{suspended ? "Suspended" : "Active"}</Pill>
                <Pill tone="brand">{d.account.plan}{d.account.legacy ? " · early access" : ""}</Pill>
                <span className="text-[12px] text-t3">Joined {fmtDate(d.account.createdAt)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 -mr-2 -mt-1 rounded-lg text-t3 hover:text-t1 hover:bg-surface-2" aria-label="Close"><X className="w-5 h-5" /></button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading || !d ? <div className="py-16"><Spinner /></div> : (
            <>
              <ErrorBanner message={error} />

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Revenue", naira(d.usage.revenue)],
                  ["Sales", d.usage.txns.toLocaleString()],
                  ["Products", String(d.usage.products)],
                  ["Last sale", d.usage.lastSaleAt ? fmtDate(d.usage.lastSaleAt) : "—"],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-surface-2 border border-line px-4 py-3">
                    <div className="text-[11.5px] font-medium text-t4">{l}</div>
                    <div className="font-display text-[18px] font-semibold text-t1 tabular-nums truncate mt-0.5">{v}</div>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-t4 mb-2.5">Businesses · {d.businesses.length}</h3>
                <div className="space-y-2">
                  {d.businesses.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-line">
                      <span className="grid place-items-center w-9 h-9 rounded-[10px] bg-primary-soft text-primary shrink-0"><Store className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-t1 truncate">{b.name}</div>
                        <div className="text-[12px] text-t3">{b.typeLabel} · {b.currency}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-t4 mb-2.5">People · {d.people.length}</h3>
                <div className="rounded-xl border border-line divide-y divide-line overflow-hidden">
                  {d.people.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Avatar name={p.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-t1 truncate">{p.name}</div>
                        <div className="text-[11.5px] text-t3 truncate inline-flex items-center gap-1"><Mail className="w-3 h-3" />{p.email}</div>
                      </div>
                      <Pill>{p.role}</Pill>
                    </div>
                  ))}
                </div>
              </section>

              {canAct && !d.account.isSandbox && (
                <section>
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-t4 mb-2.5">Plan</h3>
                  <div className="rounded-xl border border-line bg-surface-2 p-4">
                    <p className="text-[12.5px] text-t3 mb-3">
                      Currently <b className="text-t1 capitalize">{d.account.plan}</b>{d.account.periodEnd ? <> until {fmtDate(d.account.periodEnd)}</> : null}. Changes are logged on the customer's audit trail.
                    </p>
                    <div className="flex items-end gap-2.5 flex-wrap">
                      <label className="text-[11.5px] font-semibold text-t3 flex-1 min-w-[140px]">Set to
                        <Select value={planPick} onChange={(e) => setPlanPick(e.target.value)} className="mt-1">
                          <option value="free">Freemium</option><option value="pro">Pro</option><option value="business">Business</option><option value="legacy">Full access (early)</option>
                        </Select>
                      </label>
                      {(planPick === "pro" || planPick === "business") && (
                        <label className="text-[11.5px] font-semibold text-t3 w-24">Days
                          <Input value={planDays} onChange={(e) => setPlanDays(e.target.value.replace(/\D/g, ""))} className="mt-1" />
                        </label>
                      )}
                      <Button onClick={() => act("plan", { plan: planPick, days: Number(planDays) || 30 })} disabled={busy}>Apply</Button>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {canAct && d && !d.account.isSandbox && (
          <footer className="shrink-0 px-6 py-4 border-t border-line bg-surface-2 flex items-center gap-3">
            {suspended ? (
              <Button variant="success" onClick={() => act("status", { status: "active" })} disabled={busy}><Play className="w-4 h-4" /> Restore account</Button>
            ) : (
              <Button variant="danger" onClick={() => act("status", { status: "suspended" })} disabled={busy}><Ban className="w-4 h-4" /> Suspend account</Button>
            )}
            <span className="text-[11.5px] text-t3">{suspended ? "Flagged as suspended on this account." : "Flags the account as suspended and logs it."}</span>
          </footer>
        )}
      </aside>
    </div>
  );
}
