import { useState } from "react";
import {
  PackagePlus, Plus, Trash2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  Undo2, Wrench, RotateCcw, FlaskConical,
} from "lucide-react";
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

type Product = { id: string; name: string; stock: number; tracksSerials?: boolean; unit?: string; purchaseUnit?: string; unitsPerPurchase?: number };
type Supplier = { id: string; name: string };
type Movement = {
  id: string; productName: string; type: string; qty: number; balanceAfter: number;
  reason: string; actorName: string; at: string; refType?: string;
  unitCost?: number; supplierName?: string; wasteReason?: string;
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
const WASTE_META = { label: "Waste", icon: FlaskConical, tone: "danger" as const };
const WASTE_REASONS = [
  { key: "spoilage", label: "Spoilage" },
  { key: "staff_meal", label: "Staff meal" },
  { key: "damage", label: "Damage" },
  { key: "expired", label: "Expired" },
  { key: "broken", label: "Broken" },
  { key: "cracked", label: "Cracked" },
  { key: "rotten", label: "Rotten" },
  { key: "contaminated", label: "Contaminated" },
  { key: "other", label: "Other" },
];

const LEDGER_FILTERS = [
  { key: "", label: "All" },
  { key: "IN", label: "Stock in" },
  { key: "OUT", label: "Sales" },
  { key: "TRANSFER_OUT", label: "Transfers" },
  { key: "RETURN", label: "Returns" },
  { key: "ADJUST", label: "Adjustments" },
  { key: "waste", label: "Waste", byRefType: true },
];

export function StockIn() {
  const { activeBranch, hasModule, currency } = useSession();
  const [tab, setTab] = useState<"receive" | "waste">("receive");
  const [ledgerFilter, setLedgerFilter] = useState<{ key: string; byRefType?: boolean }>({ key: "" });
  const { data: prodData, reload: reloadProducts } = useApi<{ products: Product[] }>("/products", [activeBranch?.id]);
  const { data: supData } = useApi<{ suppliers: Supplier[] }>(hasModule("suppliers") ? "/suppliers" : null, [activeBranch?.id]);
  const { data: moveData, loading, reload: reloadMoves } = useApi<{ movements: Movement[] }>(
    `/inventory/movements?limit=40${ledgerFilter.key ? `&${ledgerFilter.byRefType ? "refType" : "type"}=${ledgerFilter.key}` : ""}`,
    [activeBranch?.id]
  );
  const products = prodData?.products || [];
  const suppliers = supData?.suppliers || [];
  const paged = usePaged(moveData?.movements || []);
  const productById = new Map(products.map((p) => [p.id, p]));

  function reloadAll() {
    reloadProducts();
    reloadMoves();
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader title="Stock In" subtitle={`Receive goods into ${activeBranch?.name || "this branch"} — every unit lands in the ledger`} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2 p-5 self-start">
          <div className="flex gap-1.5 mb-4 p-1 rounded-ctl bg-surface-2 border border-line">
            <button
              onClick={() => setTab("receive")}
              className={cn("flex-1 h-8 rounded-md text-[12px] font-semibold transition-colors", tab === "receive" ? "bg-surface text-t1 shadow-e1" : "text-t3 hover:text-t1")}
            >
              Receive stock
            </button>
            <button
              onClick={() => setTab("waste")}
              className={cn("flex-1 h-8 rounded-md text-[12px] font-semibold transition-colors", tab === "waste" ? "bg-surface text-t1 shadow-e1" : "text-t3 hover:text-t1")}
            >
              Log waste
            </button>
          </div>
          {tab === "receive" ? (
            <ReceiveForm
              products={products}
              productById={productById}
              suppliers={suppliers}
              showSuppliers={hasModule("suppliers")}
              onDone={reloadAll}
            />
          ) : (
            <WasteForm products={products} onDone={reloadAll} />
          )}
        </Card>

        <Card className="lg:col-span-3 overflow-hidden self-start">
          <div className="p-4 pb-2 flex items-center gap-3 flex-wrap">
            <span className="text-[14px] font-bold text-t1">Movement ledger</span>
            <div className="flex gap-1.5 ml-auto flex-wrap">
              {LEDGER_FILTERS.map((f) => (
                <button
                  key={f.key || "all"}
                  onClick={() => setLedgerFilter(f)}
                  className={cn(
                    "px-2.5 h-7 rounded-full text-[11px] font-semibold border transition-colors",
                    ledgerFilter.key === f.key ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <Spinner />
          ) : !moveData?.movements.length ? (
            <EmptyState icon={PackagePlus} title="No movements yet" body="Stock-ins, sales, transfers, waste and adjustments all appear here, newest first." />
          ) : (
            <>
              <div className="divide-y divide-line">
                {paged.rows.map((m) => {
                  const meta = m.refType === "waste" ? WASTE_META : TYPE_META[m.type] || TYPE_META.ADJUST;
                  const Icon = meta.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        m.qty > 0 ? "bg-success-soft text-success" : m.refType === "waste" ? "bg-danger-soft text-danger" : "bg-surface-3 text-t3")}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-t1 truncate">{m.productName}</div>
                        <div className="text-[11px] text-t3 truncate">
                          <Badge tone={meta.tone} className="mr-1.5">{meta.label}</Badge>
                          {m.unitCost !== undefined && `${fmtMoney(m.unitCost, currency)}/unit · `}
                          {m.supplierName && `${m.supplierName} · `}
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
              <Pager {...paged} onPage={paged.setPage} noun="movements" />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReceiveForm({ products, productById, suppliers, showSuppliers, onDone }: {
  products: Product[]; productById: Map<string, Product>; suppliers: Supplier[]; showSuppliers: boolean; onDone: () => void;
}) {
  const [lines, setLines] = useState<{ productId: string; qty: number; unitCost: string; serials: string }[]>([
    { productId: "", qty: 1, unitCost: "", serials: "" },
  ]);
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const setLine = (i: number, patch: Partial<{ productId: string; qty: number; unitCost: string; serials: string }>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const active = lines.filter((l) => l.productId && l.qty > 0);
    if (!active.length) { setError("Add at least one product."); return; }

    const serialLines = active.filter((l) => productById.get(l.productId)?.tracksSerials);
    for (const l of serialLines) {
      const count = l.serials.split("\n").map((s) => s.trim()).filter(Boolean).length;
      if (count !== l.qty) {
        setError(`${productById.get(l.productId)?.name}: entered ${count} serial number(s) for a quantity of ${l.qty}.`);
        return;
      }
    }

    setBusy(true); setError(""); setDone("");
    try {
      const res = await api<{ items: { name: string; added: number; stock: number }[] }>("/inventory/stock-in", {
        method: "POST",
        body: JSON.stringify({
          items: active.map((l) => {
            // Bought in one unit, tracked in another: "3 bags" of a 50kg bag
            // converts to 150kg before it ever reaches the ledger.
            const product = productById.get(l.productId);
            const factor = product?.unitsPerPurchase && product.unitsPerPurchase > 1 ? product.unitsPerPurchase : 1;
            return {
              productId: l.productId,
              qty: Math.round(l.qty * factor),
              ...(l.unitCost ? { unitCost: Number((Number(l.unitCost) / factor).toFixed(4)) } : {}),
            };
          }),
          note,
          ...(supplierId ? { supplierId } : {}),
        }),
      });

      let serialError = "";
      for (const l of serialLines) {
        const serialNos = l.serials.split("\n").map((s) => s.trim()).filter(Boolean);
        try {
          await api("/serials", { method: "POST", body: JSON.stringify({ productId: l.productId, serialNos }) });
        } catch (err: any) {
          serialError = `Stock was received, but registering serials for ${productById.get(l.productId)?.name} failed: ${err.message}`;
        }
      }

      setDone(res.items.map((i) => `${i.name} +${i.added} → now ${i.stock}`).join(" · "));
      if (serialError) setError(serialError);
      setLines([{ productId: "", qty: 1, unitCost: "", serials: "" }]);
      setNote("");
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBanner message={error} />
      {done && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold">{done}</div>}
      {lines.map((line, i) => {
        const product = productById.get(line.productId);
        const factor = product?.unitsPerPurchase && product.unitsPerPurchase > 1 ? product.unitsPerPurchase : 1;
        const buysByPurchaseUnit = factor > 1 && product?.purchaseUnit;
        return (
          <div key={i} className="space-y-2">
            <div className="flex items-end gap-2">
              <Field label={i === 0 ? "Product" : ""} className="flex-1">
                <Select value={line.productId} onChange={(e) => setLine(i, { productId: e.target.value, serials: "" })} required>
                  <option value="">Choose product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.stock} now)</option>
                  ))}
                </Select>
              </Field>
              <Field label={i === 0 ? `Qty${buysByPurchaseUnit ? ` (${product!.purchaseUnit})` : ""}` : ""} className="w-24">
                <Input type="number" min="1" value={line.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
              </Field>
              {lines.length > 1 && (
                <button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="h-10 w-10 shrink-0 rounded-ctl border border-line-2 flex items-center justify-center text-t4 hover:text-danger">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            {buysByPurchaseUnit && line.qty > 0 && (
              <div className="text-[11px] text-t4 -mt-1">{line.qty} {product!.purchaseUnit} → {Math.round(line.qty * factor)} {product!.unit || "unit"}</div>
            )}
            <Field
              label="Unit cost"
              hint={buysByPurchaseUnit ? `Optional — cost per ${product!.purchaseUnit}, if it varies` : "Optional — what this delivery actually cost, if it varies from the usual price"}
              className="max-w-[180px]"
            >
              <Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} placeholder={product ? "e.g. 180" : ""} />
            </Field>
            {product?.tracksSerials && (
              <Field label="Serial numbers" hint={`One per line — needs to match the quantity (${line.qty})`}>
                <TextArea rows={3} value={line.serials} onChange={(e) => setLine(i, { serials: e.target.value })} placeholder={"IMEI123456\nIMEI123457"} />
              </Field>
            )}
          </div>
        );
      })}
      <button type="button" onClick={() => setLines((ls) => [...ls, { productId: "", qty: 1, unitCost: "", serials: "" }])} className="flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
        <Plus className="w-3.5 h-3.5" /> Add another line
      </button>
      {showSuppliers && (
        <Field label="Supplier" hint="Optional">
          <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Not specified</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Note" hint="e.g. delivery reference">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Delivery from Dangote depot" />
      </Field>
      <Button type="submit" className="w-full" disabled={busy}>
        <PackagePlus className="w-4 h-4" /> {busy ? "Recording…" : "Receive stock"}
      </Button>
    </form>
  );
}

function WasteForm({ products, onDone }: { products: Product[]; onDone: () => void }) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("spoilage");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || qty <= 0) { setError("Choose a product and a quantity."); return; }
    setBusy(true); setError(""); setDone("");
    try {
      await api("/inventory/waste", {
        method: "POST",
        body: JSON.stringify({ productId, qty, wasteReason: reason, note }),
      });
      const name = products.find((p) => p.id === productId)?.name || "Item";
      setDone(`${name} −${qty} logged as ${WASTE_REASONS.find((r) => r.key === reason)?.label.toLowerCase()}.`);
      setProductId(""); setQty(1); setNote("");
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBanner message={error} />
      {done && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold">{done}</div>}
      <div className="flex items-end gap-2">
        <Field label="Product" className="flex-1">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Choose product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} now)</option>)}
          </Select>
        </Field>
        <Field label="Qty" className="w-20">
          <Input type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Reason">
        <div className="flex flex-wrap gap-1.5">
          {WASTE_REASONS.map((r) => (
            <button
              type="button"
              key={r.key}
              onClick={() => setReason(r.key)}
              className={cn(
                "px-2.5 h-7 rounded-full text-[11px] font-semibold border transition-colors",
                reason === r.key ? "bg-danger-soft border-danger/40 text-danger" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Note" hint="Optional">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. tomatoes gone bad" />
      </Field>
      <Button type="submit" variant="danger" className="w-full" disabled={busy}>
        <FlaskConical className="w-4 h-4" /> {busy ? "Logging…" : "Log waste"}
      </Button>
    </form>
  );
}
