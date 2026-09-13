import { useState } from "react";
import { ClipboardList, ClipboardCheck, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Line = { productId: string; productName: string; unit: string; systemQty: number; countedQty: number | null; variance: number | null };
type Count = { id: string; countNo: string; status: "open" | "closed"; lines: Line[]; note: string; startedByName: string; closedByName: string; closedAt: string | null; at: string };

// The doc's "expected vs. actual" check, made concrete: open a count against
// today's system numbers, walk the shelf, and close it — any gap posts as an
// ordinary stock adjustment, tagged so it's traceable back to this session.
export function StockCount() {
  const { can } = useSession();
  const { data, loading, reload } = useApi<{ counts: Count[] }>("/stock-counts?limit=20", []);
  const counts = data?.counts || [];
  const openCount = counts.find((c) => c.status === "open");
  const [starting, setStarting] = useState(false);

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <PageHeader
        title="Stock Counts"
        subtitle="Physical counts reconciled against what the system thinks is on hand"
        actions={can("stock") && !openCount ? <Button onClick={() => setStarting(true)}><Plus className="w-4 h-4" /> Start count</Button> : undefined}
      />

      {loading ? (
        <Spinner />
      ) : openCount ? (
        <ActiveCount count={openCount} canManage={can("stock")} onChanged={reload} />
      ) : counts.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No counts yet"
            body="Start a count to walk the shelf and reconcile physical quantities against the system — any gap posts automatically as an adjustment."
          />
        </Card>
      ) : null}

      {!openCount && counts.length > 0 && (
        <div className="mt-6">
          <div className="text-[12px] font-bold uppercase tracking-wide text-t3 mb-2">History</div>
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {counts.map((c) => {
                const varianceLines = c.lines.filter((l) => l.variance);
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-surface-3 text-t3 flex items-center justify-center shrink-0">
                      <ClipboardCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-t1">{c.countNo}</div>
                      <div className="text-[11px] text-t3">{c.lines.length} items · {c.startedByName} · {fmtDateTime(c.at)}</div>
                    </div>
                    {varianceLines.length > 0 ? (
                      <Badge tone="warning">{varianceLines.length} variance{varianceLines.length === 1 ? "" : "s"}</Badge>
                    ) : (
                      <Badge tone="success">Matched</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <StartCountModal open={starting} onClose={() => setStarting(false)} onStarted={() => { setStarting(false); reload(); }} />
    </div>
  );
}

function StartCountModal({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: () => void }) {
  const { data } = useApi<{ categories: string[] }>(open ? "/products/categories" : null, [open]);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    try {
      await api("/stock-counts", { method: "POST", body: JSON.stringify({ category: category || undefined }) });
      setCategory("");
      onStarted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <Card className="p-5 mb-6">
      <div className="text-[13px] font-bold text-t1 mb-3">Start a new count</div>
      {error && <div className="text-[12px] text-danger mb-2">{error}</div>}
      <div className="flex items-end gap-2">
        <Field label="Scope" hint="Optional — leave blank to count everything" className="flex-1 max-w-xs">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Every stock product</option>
            {(data?.categories || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Start"}</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

function ActiveCount({ count, canManage, onChanged }: { count: Count; canManage: boolean; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const valueFor = (l: Line) => drafts[l.productId] ?? (l.countedQty === null ? "" : String(l.countedQty));

  async function saveLine(productId: string, raw: string) {
    setDrafts((d) => ({ ...d, [productId]: raw }));
    if (raw === "") return;
    const countedQty = Number(raw);
    if (Number.isNaN(countedQty) || countedQty < 0) return;
    await api(`/stock-counts/${count.id}`, { method: "PATCH", body: JSON.stringify({ lines: [{ productId, countedQty }] }) }).catch(() => {});
  }

  async function close() {
    if (!confirm("Close this count? Any difference from the system posts as a stock adjustment.")) return;
    setBusy(true); setError("");
    try {
      await api(`/stock-counts/${count.id}/close`, { method: "POST" });
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const countedSoFar = count.lines.filter((l) => valueFor(l) !== "").length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
        <span className="text-[13px] font-bold text-t1">{count.countNo}</span>
        <Badge tone="brand">Open</Badge>
        <span className="text-[11px] text-t3">{countedSoFar}/{count.lines.length} counted</span>
        {canManage && (
          <Button size="sm" className="ml-auto" onClick={close} disabled={busy}>
            <Lock className="w-3.5 h-3.5" /> {busy ? "Closing…" : "Close count"}
          </Button>
        )}
      </div>
      {error && <div className="px-4 py-2 text-[12px] text-danger">{error}</div>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-t4 border-b border-line">
              <th className="px-4 py-2">Product</th>
              <th className="px-4 py-2 text-right">System</th>
              <th className="px-4 py-2 text-right">Counted</th>
              <th className="px-4 py-2 text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {count.lines.map((l) => {
              const val = valueFor(l);
              const variance = val === "" ? null : Number(val) - l.systemQty;
              return (
                <tr key={l.productId}>
                  <td className="px-4 py-2 text-[13px] text-t1">{l.productName}</td>
                  <td className="px-4 py-2 text-right font-mono text-[12px] text-t3">{l.systemQty} {l.unit}</td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number" min="0" value={val}
                      onChange={(e) => setDrafts((d) => ({ ...d, [l.productId]: e.target.value }))}
                      onBlur={(e) => saveLine(l.productId, e.target.value)}
                      disabled={!canManage}
                      className="!w-24 !h-8 text-right ml-auto"
                    />
                  </td>
                  <td className={cn("px-4 py-2 text-right font-mono text-[12px] font-bold", variance === null ? "text-t4" : variance === 0 ? "text-success" : "text-warning")}>
                    {variance === null ? "—" : variance > 0 ? `+${variance}` : variance}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
