import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Plus, Search, Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { typeMeta } from "@/lib/businessTypes";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Product = {
  id: string; name: string; barcode: string; category: string;
  price: number; cost?: number; reorderLevel: number; stock: number; status: string;
  expiry?: string | null;
};

export function Products() {
  const { activeBranch, activeBusiness, currency, can, hasModule } = useSession();
  const term = typeMeta(activeBusiness?.typeKey).products;
  const { data, loading, reload } = useApi<{ products: Product[] }>("/products", [activeBranch?.id]);
  const products = data?.products || [];
  const showCost = products.some((p) => p.cost !== undefined);

  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  // Global search (topbar) lands here with ?q= — keep the box in sync.
  useEffect(() => {
    const fromUrl = searchParams.get("q");
    if (fromUrl !== null) setQ(fromUrl);
  }, [searchParams]);

  const cats = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);
  const filtered = products.filter(
    (p) => (cat === "All" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase())
  );

  async function archive(p: Product) {
    if (!confirm(`Archive "${p.name}"? It disappears from the POS but keeps its sales history.`)) return;
    await api(`/products/${p.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title={term}
        subtitle={`${products.length} in catalog · ${activeBranch?.name || "no branch"} stock shown`}
        actions={can("prices") && <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add product</Button>}
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
          />
        </div>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "px-3 h-8 rounded-full text-[12px] font-semibold border transition-colors",
              cat === c ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface border-line-2 text-t3 hover:text-t1"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Package}
            title="No products yet"
            body="Your catalog is empty. Add your first product and it appears on the POS instantly."
            action={can("prices") && <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add your first product</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left">
                  {["Product", "Category", "Price", ...(showCost ? ["Cost"] : []), "Stock", ""].map((h, i) => (
                    <th key={i} className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-t4 border-b border-line">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const low = p.stock <= p.reorderLevel;
                  return (
                    <tr key={p.id} className="hover:bg-surface-2 transition-colors border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-semibold text-t1">{p.name}</div>
                        {p.barcode && <div className="text-[11px] font-mono text-t4">{p.barcode}</div>}
                      </td>
                      <td className="px-4 py-3"><Badge tone="neutral">{p.category}</Badge></td>
                      <td className="px-4 py-3 font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(p.price, currency)}</td>
                      {showCost && (
                        <td className="px-4 py-3 font-mono text-[12px] text-t3 tabular-nums">{p.cost !== undefined ? fmtMoney(p.cost, currency) : "—"}</td>
                      )}
                      <td className="px-4 py-3">
                        <span className={cn("font-mono text-[13px] font-bold tabular-nums", low ? "text-danger" : "text-t1")}>{p.stock}</span>
                        {low && <span className="ml-2"><Badge tone="warning">Reorder</Badge></span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {can("prices") && (
                          <>
                            <button onClick={() => setEditing(p)} className="p-1.5 rounded-lg text-t3 hover:text-primary hover:bg-primary-soft transition-colors" title="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => archive(p)} className="p-1.5 rounded-lg text-t3 hover:text-danger hover:bg-danger-soft transition-colors" title="Archive">
                              <Archive className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ProductModal
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        showCost={can("prices")}
        showExpiry={hasModule("expiry")}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
    </div>
  );
}

function ProductModal({
  editing, showCost, showExpiry, onClose, onSaved,
}: {
  editing: Product | "new" | null;
  showCost: boolean;
  showExpiry: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === "new";
  const p = isNew || !editing ? null : editing;
  const [form, setForm] = useState({
    name: p?.name || "",
    category: p?.category || "General",
    barcode: p?.barcode || "",
    price: p?.price ?? ("" as number | ""),
    cost: p?.cost ?? ("" as number | ""),
    reorderLevel: p?.reorderLevel ?? 5,
    openingStock: 0,
    expiry: p?.expiry ? String(p.expiry).slice(0, 10) : "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        category: form.category.trim() || "General",
        barcode: form.barcode.trim(),
        price: Number(form.price) || 0,
        cost: Number(form.cost) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        ...(showExpiry ? { expiry: form.expiry } : {}),
        ...(isNew ? { openingStock: Number(form.openingStock) || 0 } : {}),
      };
      if (isNew) await api("/products", { method: "POST", body: JSON.stringify(body) });
      else await api(`/products/${p!.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!editing} onClose={onClose} title={isNew ? "Add product" : `Edit ${p?.name}`} subtitle={isNew ? "It appears on the POS immediately" : "Price changes are logged to the audit trail"}>
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Name"><Input autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Golden Penny Semovita 2kg" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Grains" /></Field>
          <Field label="Barcode" hint="Optional — scan into this box"><Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Selling price`}><Input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} /></Field>
          {showCost && <Field label="Cost price" hint="Only finance roles see this"><Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reorder level" hint="Low-stock alert threshold"><Input type="number" min="0" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} /></Field>
          {isNew && <Field label="Opening stock" hint="Booked as a stock-in"><Input type="number" min="0" value={form.openingStock} onChange={(e) => set("openingStock", e.target.value)} /></Field>}
        </div>
        {showExpiry && (
          <Field label="Expiry date" hint="Optional — feeds the expiring-soon report">
            <Input type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} />
          </Field>
        )}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : isNew ? "Add product" : "Save changes"}</Button>
      </form>
    </Modal>
  );
}
