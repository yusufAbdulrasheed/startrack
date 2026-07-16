import { useState } from "react";
import { PackagePlus, Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Undo2, Wrench, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string; stock: number };
type Movement = {
  id: string; productName: string; type: string; qty: number; balanceAfter: number;
  reason: string; actorName: string; at: string;
};

const TYPE_META: Record<string, { label: string; icon: any; tone: "success" | "danger" | "brand" | "warning" | "neutral" }> = {
  IN: { label: "Stock in", icon: ArrowDownToLine, tone: "success" },
  OUT: { label: "Sale", icon: ArrowUpFromLine, tone: "neutral" },
  TRANSFER_IN: { label: "Transfer in", icon: ArrowLeftRight, tone: "brand" },
  TRANSFER_OUT: { label: "Transfer out", icon: ArrowLeftRight, tone: "warning" },
  RETURN: { label: "Return", icon: Undo2, tone: "brand" },
  ADJUST: { label: "Adjustment", icon: Wrench, tone: "warning" },
  VOID_RESTOCK: { label: "Void restock", icon: RotateCcw, tone: "danger" },
};

export function StockIn() {
  const { activeBranch } = useSession();
  const { data: prodData, reload: reloadProducts } = useApi<{ products: Product[] }>("/products", [activeBranch?.id]);
  const { data: moveData, loading, reload: reloadMoves } = useApi<{ movements: Movement[] }>("/inventory/movements?limit=30", [activeBranch?.id]);
  const products = prodData?.products || [];

  const [lines, setLines] = useState<{ productId: string; qty: number }[]>([{ productId: "", qty: 1 }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, patch: Partial<{ productId: string; qty: number }>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const items = lines.filter((l) => l.productId && l.qty > 0);
    if (!items.length) { setError("Add at least one product."); return; }
    setBusy(true); setError(""); setDone("");
    try {
      const res = await api<{ items: { name: string; added: number; stock: number }[] }>("/inventory/stock-in", {
        method: "POST",
        body: JSON.stringify({ items, note }),
      });
      setDone(res.items.map((i) => `${i.name} +${i.added} → now ${i.stock}`).join(" · "));
      setLines([{ productId: "", qty: 1 }]);
      setNote("");
      reloadProducts();
      reloadMoves();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader title="Stock In" subtitle={`Receive goods into ${activeBranch?.name || "this branch"} — every unit lands in the ledger`} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2 p-5 self-start">
          <form onSubmit={submit} className="space-y-3">
            <ErrorBanner message={error} />
            {done && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold">{done}</div>}
            {lines.map((line, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label={i === 0 ? "Product" : ""} className="flex-1">
                  <Select value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value })} required>
                    <option value="">Choose product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.stock} now)</option>
                    ))}
                  </Select>
                </Field>
                <Field label={i === 0 ? "Qty" : ""} className="w-20">
                  <Input type="number" min="1" value={line.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
                </Field>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="h-10 w-10 shrink-0 rounded-ctl border border-line-2 flex items-center justify-center text-t4 hover:text-danger">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setLines((ls) => [...ls, { productId: "", qty: 1 }])} className="flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
              <Plus className="w-3.5 h-3.5" /> Add another line
            </button>
            <Field label="Note" hint="e.g. supplier or delivery reference">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery from Dangote depot" />
            </Field>
            <Button type="submit" className="w-full" disabled={busy}>
              <PackagePlus className="w-4 h-4" /> {busy ? "Recording…" : "Receive stock"}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-3 overflow-hidden self-start">
          <div className="p-4 pb-2 text-[14px] font-bold text-t1">Movement ledger</div>
          {loading ? (
            <Spinner />
          ) : !moveData?.movements.length ? (
            <EmptyState icon={PackagePlus} title="No movements yet" body="Stock-ins, sales, transfers and adjustments all appear here, newest first." />
          ) : (
            <div className="divide-y divide-line">
              {moveData.movements.map((m) => {
                const meta = TYPE_META[m.type] || TYPE_META.ADJUST;
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
      </div>
    </div>
  );
}
