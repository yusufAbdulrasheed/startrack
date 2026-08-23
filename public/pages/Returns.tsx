import { useState } from "react";
import { Undo2, Search, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select, TextArea } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePaged, Pager } from "@/components/ui/Pager";
import { useSession } from "@/lib/session";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type SaleItem = { productId: string; name: string; qty: number; unitPrice: number; returnedQty: number };
type Sale = { id: string; saleNo: string; at: string; staffName: string; total: number; items: SaleItem[]; status: string };
type Ret = {
  id: string; saleNo: string; items: { name: string; qty: number }[]; refund: { method: string; amount: number };
  reason: string; status: "pending" | "approved" | "rejected"; requestedByName: string;
  decidedByName?: string; decidedAt?: string; createdAt: string;
};

export function Returns() {
  const { activeBranch, currency, can } = useSession();
  const { data, loading, reload } = useApi<{ returns: Ret[] }>("/returns", [activeBranch?.id]);
  const returns = data?.returns || [];
  const pending = returns.filter((r) => r.status === "pending");
  const decided = returns.filter((r) => r.status !== "pending");
  const pendingPaged = usePaged(pending);
  const decidedPaged = usePaged(decided);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader title="Returns" subtitle="Staff submit · managers approve · stock and money correct themselves" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <SubmitReturn onSubmitted={reload} currency={currency} />
        </div>

        <div className="lg:col-span-3 space-y-4">
          <Card className="overflow-hidden">
            <div className="p-4 pb-2 flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" />
              <span className="text-[14px] font-bold text-t1">Awaiting decision</span>
              {pending.length > 0 && <Badge tone="warning">{pending.length}</Badge>}
            </div>
            {loading ? (
              <Spinner />
            ) : pending.length === 0 ? (
              <EmptyState icon={Undo2} title="Nothing pending" body="New return requests land here for a manager to approve or reject." />
            ) : (
              <div className="divide-y divide-line">
                {pendingPaged.rows.map((r) => (
                  <ReturnRow key={r.id} r={r} currency={currency} canDecide={can("approve_returns")} onDecided={reload} />
                ))}
              </div>
            )}
            <Pager {...pendingPaged} onPage={pendingPaged.setPage} noun="pending" />
          </Card>

          {decided.length > 0 && (
            <Card className="overflow-hidden">
              <div className="p-4 pb-2 text-[14px] font-bold text-t1">History</div>
              <div className="divide-y divide-line">
                {decidedPaged.rows.map((r) => (
                  <ReturnRow key={r.id} r={r} currency={currency} canDecide={false} onDecided={reload} />
                ))}
              </div>
              <Pager {...decidedPaged} onPage={decidedPaged.setPage} noun="decided" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ReturnRow({ r, currency, canDecide, onDecided }: { r: Ret; currency: string; canDecide: boolean; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "approve" | "reject") {
    setBusy(true); setError("");
    try {
      await api(`/returns/${r.id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      onDecided();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
          r.status === "approved" ? "bg-success-soft text-success" : r.status === "rejected" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
          <Undo2 className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] font-bold text-primary">{r.saleNo}</span>
            <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge>
            <span className="text-[11px] text-t4">{fmtDateTime(r.createdAt)}</span>
          </div>
          <div className="text-[13px] text-t1 mt-1">{r.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
          <div className="text-[12px] text-t3 mt-0.5">
            "{r.reason}" — {r.requestedByName}
            {r.decidedByName && <> · {r.status} by {r.decidedByName}</>}
          </div>
          {error && <div className="text-[11px] text-danger font-semibold mt-1">{error}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[14px] font-bold text-t1 tabular-nums">{fmtMoney(r.refund.amount, currency)}</div>
          <div className="text-[10px] uppercase text-t4">{r.refund.method} refund</div>
          {r.status === "pending" && canDecide && (
            <div className="flex gap-1.5 mt-2">
              <Button size="sm" variant="success" disabled={busy} onClick={() => decide("approve")}><Check className="w-3.5 h-3.5" /> Approve</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide("reject")}><X className="w-3.5 h-3.5" /> Reject</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitReturn({ onSubmitted, currency }: { onSubmitted: () => void; currency: string }) {
  const [receiptNo, setReceiptNo] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"cash" | "pos" | "transfer">("cash");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function findSale(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setDone(""); setSale(null); setQtys({});
    try {
      const res = await api<{ sales: Sale[] }>(`/sales?saleNo=${encodeURIComponent(receiptNo.trim())}&limit=1`);
      const found = res.sales[0];
      if (!found) { setError("No sale with that receipt number in this branch."); return; }
      if (found.status === "voided") { setError("That sale was voided — nothing to return."); return; }
      setSale(found);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;
    const items = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    if (!items.length) { setError("Set a quantity on at least one item."); return; }
    setBusy(true); setError("");
    try {
      await api("/returns", { method: "POST", body: JSON.stringify({ saleId: sale.id, items, reason, refundMethod: method }) });
      setDone(`Return for ${sale.saleNo} submitted for approval.`);
      setSale(null); setReceiptNo(""); setReason(""); setQtys({});
      onSubmitted();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 self-start">
      <div className="text-[14px] font-bold text-t1 mb-3">Submit a return</div>
      <ErrorBanner message={error} />
      {done && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold mb-3">{done}</div>}

      <form onSubmit={findSale} className="flex gap-2 mt-3">
        <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="Receipt no. e.g. R-00042" required />
        <Button type="submit" variant="secondary" className="shrink-0"><Search className="w-4 h-4" /> Find</Button>
      </form>

      {sale && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="text-[12px] text-t3">
            <span className="font-mono font-bold text-primary">{sale.saleNo}</span> · {fmtDateTime(sale.at)} · by {sale.staffName} · {fmtMoney(sale.total, currency)}
          </div>
          <div className="space-y-2">
            {sale.items.map((i) => {
              const returnable = i.qty - i.returnedQty;
              return (
                <div key={i.productId} className="flex items-center gap-2 px-3 py-2 rounded-ctl bg-surface-2 border border-line">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-t1 truncate">{i.name}</div>
                    <div className="text-[11px] text-t4">bought {i.qty}{i.returnedQty > 0 ? ` · already returned ${i.returnedQty}` : ""}</div>
                  </div>
                  <Input
                    type="number" min="0" max={returnable}
                    value={qtys[i.productId] ?? 0}
                    onChange={(e) => setQtys((q) => ({ ...q, [i.productId]: Math.min(returnable, Math.max(0, Number(e.target.value) || 0)) }))}
                    className="!w-16 text-right"
                    disabled={returnable === 0}
                  />
                </div>
              );
            })}
          </div>
          <Field label="Reason"><TextArea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged bag, wrong size…" /></Field>
          <Field label="Refund method">
            <Select value={method} onChange={(e) => setMethod(e.target.value as any)}>
              <option value="cash">Cash</option>
              <option value="pos">POS</option>
              <option value="transfer">Transfer</option>
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={busy}><Undo2 className="w-4 h-4" /> {busy ? "Submitting…" : "Submit for approval"}</Button>
        </form>
      )}
    </Card>
  );
}
