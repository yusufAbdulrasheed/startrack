import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Plus, Search, Pencil, Archive, Upload, Download, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { typeMeta } from "@/lib/businessTypes";
import { downloadCsv, parseCsv } from "@/lib/csv";
import { printReport, mono } from "@/lib/printReport";
import { fmtMoney, fmtDate } from "@/lib/format";
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
  const [importing, setImporting] = useState(false);
  const [printing, setPrinting] = useState(false);

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
        actions={
          <>
            <Button variant="secondary" onClick={() => setPrinting(true)} disabled={!products.length}><Printer className="w-4 h-4" /> Print</Button>
            {can("prices") && (
              <>
                <Button variant="secondary" onClick={() => setImporting(true)}><Upload className="w-4 h-4" /> Import CSV</Button>
                <Button onClick={() => setEditing("new")}><Plus className="w-4 h-4" /> Add product</Button>
              </>
            )}
          </>
        }
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
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={() => { setImporting(false); reload(); }} />
      <PrintInventoryModal
        open={printing}
        onClose={() => setPrinting(false)}
        products={products}
        businessName={activeBusiness?.name || "StarTrack"}
        branchName={activeBranch?.name || ""}
        currency={currency}
        showCost={showCost}
        showExpiry={hasModule("expiry")}
        term={term}
      />
    </div>
  );
}

// Print Inventory — mirrors the legacy report: choose columns, skip
// zero-stock, branded table with a stock-value total.
function PrintInventoryModal({
  open, onClose, products, businessName, branchName, currency, showCost, showExpiry, term,
}: {
  open: boolean; onClose: () => void; products: Product[];
  businessName: string; branchName: string; currency: string;
  showCost: boolean; showExpiry: boolean; term: string;
}) {
  const [cols, setCols] = useState({ category: true, stock: true, price: true, cost: false, value: true, status: true, expiry: false });
  const [excludeZero, setExcludeZero] = useState(false);
  const toggle = (k: keyof typeof cols) => setCols((c) => ({ ...c, [k]: !c[k] }));

  const OPTIONS: { k: keyof typeof cols; label: string; show: boolean }[] = [
    { k: "category", label: "Category", show: true },
    { k: "stock", label: "Stock level", show: true },
    { k: "price", label: "Selling price", show: true },
    { k: "cost", label: "Cost price", show: showCost },
    { k: "value", label: "Stock value", show: showCost },
    { k: "status", label: "Status", show: true },
    { k: "expiry", label: "Expiry date", show: showExpiry },
  ];

  function run() {
    const rows = products.filter((p) => (excludeZero ? p.stock > 0 : true));
    const columns = [
      { label: "#", align: "left" as const, render: (_p: Product, i: number) => mono(String(i + 1)) },
      { label: "Product", render: (p: Product) => `<b>${p.name}</b>` },
      ...(cols.category ? [{ label: "Category", render: (p: Product) => p.category || "—" }] : []),
      ...(cols.stock ? [{
        label: "Stock", align: "right" as const,
        render: (p: Product) => {
          const color = p.stock <= 0 ? "#dc2626" : p.stock <= p.reorderLevel ? "#d97706" : "#059669";
          return `<span style="color:${color};font-family:'Courier New',monospace;font-weight:700">${p.stock}</span>`;
        },
      }] : []),
      ...(cols.price ? [{ label: "Price", align: "right" as const, render: (p: Product) => mono(fmtMoney(p.price, currency)) }] : []),
      ...(cols.cost && showCost ? [{ label: "Cost", align: "right" as const, render: (p: Product) => mono(fmtMoney(p.cost || 0, currency)) }] : []),
      ...(cols.value && showCost ? [{ label: "Stock Value", align: "right" as const, render: (p: Product) => mono(fmtMoney((p.cost || 0) * p.stock, currency)) }] : []),
      ...(cols.expiry && showExpiry ? [{ label: "Expiry", align: "right" as const, render: (p: Product) => (p.expiry ? fmtDate(p.expiry) : "—") }] : []),
      ...(cols.status ? [{
        label: "Status", align: "center" as const,
        render: (p: Product) => {
          const [label, color] = p.stock <= 0 ? ["Out of Stock", "#dc2626"] : p.stock <= p.reorderLevel ? ["Low Stock", "#d97706"] : ["Available", "#059669"];
          return `<span style="color:${color};font-weight:700;font-size:11px">${label}</span>`;
        },
      }] : []),
    ];
    const totals = columns.map((c) =>
      c.label === "#" ? "Total" :
      c.label === "Stock" ? String(rows.reduce((s, p) => s + p.stock, 0)) :
      c.label === "Stock Value" ? fmtMoney(rows.reduce((s, p) => s + (p.cost || 0) * p.stock, 0), currency) : ""
    );
    printReport({
      businessName,
      title: `${term} Report${branchName ? ` — ${branchName}` : ""}`,
      subtitle: `${rows.length} products${excludeZero ? " · zero stock excluded" : ""}`,
      columns, rows, totals,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Print inventory" subtitle="Choose what appears on the report — it opens ready to print">
      <div className="space-y-1.5">
        {OPTIONS.filter((o) => o.show).map((o) => (
          <button key={o.k} type="button" onClick={() => toggle(o.k)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-ctl bg-surface-2 border border-line text-left hover:border-brand-300 transition-colors">
            <span className="text-[13px] font-semibold text-t1">{o.label}</span>
            <span className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${cols[o.k] ? "bg-primary" : "bg-surface-3 border border-line-2"}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${cols[o.k] ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
        ))}
        <button type="button" onClick={() => setExcludeZero((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-ctl bg-surface-2 border border-line text-left hover:border-brand-300 transition-colors">
          <span className="text-[13px] font-semibold text-t1">Skip out-of-stock items</span>
          <span className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${excludeZero ? "bg-primary" : "bg-surface-3 border border-line-2"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${excludeZero ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
      <Button className="w-full mt-4" onClick={run}><Printer className="w-4 h-4" /> Open print view</Button>
    </Modal>
  );
}

type ImportRow = {
  name: string; category: string; barcode: string;
  price: number; cost: number; reorderLevel: number; openingStock: number; expiry: string;
};
type ImportResult = { created: number; skipped: { row: number; name: string; reason: string }[] };

// Header aliases: the parser lowercases and strips non-alphanumerics, so
// "Opening Stock", "opening_stock" and "openingstock" all match.
const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== "") return r[k];
  return "";
};

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setRows([]); setFileName(""); setError(""); setResult(null);
  }

  function downloadTemplate() {
    downloadCsv("startrack-products-template.csv", [
      { name: "Golden Penny Semovita 2kg", category: "Grains", barcode: "6151100017341", price: 2000, cost: 1500, "reorder level": 10, "opening stock": 50, expiry: "" },
      { name: "Peak Milk 400g", category: "Dairy", barcode: "", price: 1500, cost: 1100, "reorder level": 15, "opening stock": 24, expiry: "2027-01-31" },
    ]);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setResult(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ""));
      if (!parsed.length) { setError("Couldn't read any rows. Check the file has a header row (use the template)."); setRows([]); return; }
      const mapped = parsed.map((r) => ({
        name: pick(r, "name", "product", "productname", "item"),
        category: pick(r, "category", "cat") || "General",
        barcode: pick(r, "barcode", "sku", "code"),
        price: Number(pick(r, "price", "sellingprice", "sellprice")) || 0,
        cost: Number(pick(r, "cost", "costprice")) || 0,
        reorderLevel: Number(pick(r, "reorderlevel", "reorder")) || 5,
        openingStock: Number(pick(r, "openingstock", "stock", "qty", "quantity")) || 0,
        expiry: pick(r, "expiry", "expirydate"),
      }));
      setRows(mapped);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function runImport() {
    setBusy(true); setError("");
    try {
      const res = await api<ImportResult>("/products/import", { method: "POST", body: JSON.stringify({ rows }) });
      setResult(res);
      setRows([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const bad = rows.filter((r) => !r.name || r.price <= 0).length;

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Import products from CSV" subtitle="Migrate from Excel, Google Sheets, or your old system in one go" wide>
      {result ? (
        <div>
          <div className="px-3 py-3 rounded-ctl bg-success-soft text-success text-[13px] font-semibold">
            ✓ {result.created} product{result.created === 1 ? "" : "s"} imported{result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}
          </div>
          {result.skipped.length > 0 && (
            <div className="mt-3 max-h-48 overflow-y-auto rounded-ctl border border-line divide-y divide-line">
              {result.skipped.map((s, i) => (
                <div key={i} className="px-3 py-2 text-[12px]">
                  <span className="font-semibold text-t1">Row {s.row} — {s.name}:</span>{" "}
                  <span className="text-t3">{s.reason}</span>
                </div>
              ))}
            </div>
          )}
          <Button className="w-full mt-4" onClick={() => { reset(); onDone(); }}>Done</Button>
        </div>
      ) : rows.length === 0 ? (
        <div>
          <ErrorBanner message={error} />
          <label className="mt-2 flex flex-col items-center justify-center gap-2 py-10 rounded-card border-2 border-dashed border-line-2 cursor-pointer hover:border-brand-400 hover:bg-primary-softer transition-colors">
            <FileSpreadsheet className="w-8 h-8 text-t3" />
            <span className="text-[13px] font-semibold text-t1">Choose a CSV file</span>
            <span className="text-[12px] text-t3">Columns: name, category, barcode, price, cost, reorder level, opening stock, expiry</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
          <button onClick={downloadTemplate} className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline mx-auto">
            <Download className="w-3.5 h-3.5" /> Download the template
          </button>
        </div>
      ) : (
        <div>
          <ErrorBanner message={error} />
          <div className="flex items-center gap-2 text-[13px] text-t2 mb-3">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
            <span className="font-semibold text-t1">{fileName}</span> · {rows.length} row{rows.length === 1 ? "" : "s"}
            {bad > 0 && <Badge tone="warning">{bad} missing name or price — will be skipped</Badge>}
          </div>
          <div className="max-h-64 overflow-auto rounded-ctl border border-line">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="text-left">
                  {["Name", "Category", "Price", "Cost", "Opening stock"].map((h) => (
                    <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-t4 border-b border-line bg-surface-2 sticky top-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className={cn("border-b border-line last:border-0", (!r.name || r.price <= 0) && "opacity-40")}>
                    <td className="px-3 py-1.5 text-[12px] font-medium text-t1">{r.name || "—"}</td>
                    <td className="px-3 py-1.5 text-[12px] text-t3">{r.category}</td>
                    <td className="px-3 py-1.5 text-[12px] font-mono text-t1">{r.price}</td>
                    <td className="px-3 py-1.5 text-[12px] font-mono text-t3">{r.cost}</td>
                    <td className="px-3 py-1.5 text-[12px] font-mono text-t3">{r.openingStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 50 && <div className="px-3 py-2 text-[11px] text-t4">…and {rows.length - 50} more rows</div>}
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={reset}>Choose another file</Button>
            <Button className="flex-1" disabled={busy || rows.length === bad} onClick={runImport}>
              <Upload className="w-4 h-4" /> {busy ? "Importing…" : `Import ${rows.length - bad} products`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
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
