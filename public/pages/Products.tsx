import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Plus, Search, Pencil, Archive, Upload, Download, FileSpreadsheet, Printer, Barcode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePaged, Pager } from "@/components/ui/Pager";
import { useSession } from "@/lib/session";
import { typeMeta } from "@/lib/businessTypes";
import { parseCsv } from "@/lib/csv";
import { parseXlsx } from "@/lib/xlsx";
import { downloadProductTemplate } from "@/lib/productTemplate";
import { printReport, mono } from "@/lib/printReport";
import { printBarcodeLabels, type LabelSize } from "@/lib/barcodes";
import { fmtMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type BomLine = { productId: string; per: "sqm" | "width" | "height" | "unit"; factor: number };
type Product = {
  id: string; name: string; barcode: string; category: string;
  archetype?: string; bom?: BomLine[];
  price: number; cost?: number; reorderLevel: number; stock: number | null; status: string;
  expiry?: string | null;
};

const PER_LABELS: Record<BomLine["per"], string> = {
  sqm: "per m² of the order",
  width: "per meter of width",
  height: "per meter of height",
  unit: "per item (fixed)",
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
  const [labeling, setLabeling] = useState(false);

  // Global search (topbar) lands here with ?q= — keep the box in sync.
  useEffect(() => {
    const fromUrl = searchParams.get("q");
    if (fromUrl !== null) setQ(fromUrl);
  }, [searchParams]);

  const cats = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);
  const filtered = products.filter(
    (p) => (cat === "All" || p.category === cat) && p.name.toLowerCase().includes(q.toLowerCase())
  );
  const paged = usePaged(filtered);

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
            <Button variant="secondary" onClick={() => setLabeling(true)} disabled={!products.some((p) => p.barcode)}><Barcode className="w-4 h-4" /> Labels</Button>
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
                {paged.rows.map((p) => {
                  const low = p.stock !== null && p.stock <= p.reorderLevel;
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
                        {p.stock === null ? (
                          <Badge tone="brand">Made to order</Badge>
                        ) : (
                          <>
                            <span className={cn("font-mono text-[13px] font-bold tabular-nums", low ? "text-danger" : "text-t1")}>{p.stock}</span>
                            {low && <span className="ml-2"><Badge tone="warning">Reorder</Badge></span>}
                          </>
                        )}
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
          <Pager {...paged} onPage={paged.setPage} noun="products" />

        </Card>
      )}

      <ProductModal
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        showCost={can("prices")}
        showExpiry={hasModule("expiry")}
        mtoAllowed={hasModule("made_to_order")}
        componentChoices={products.filter((p) => p.archetype !== "made_to_order")}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); reload(); }}
      />
      <ImportModal
        open={importing}
        onClose={() => setImporting(false)}
        onDone={() => { setImporting(false); reload(); }}
        categories={cats.filter((c) => c !== "All")}
      />
      <BarcodeLabelsModal open={labeling} onClose={() => setLabeling(false)} products={products} currency={currency} />
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

// Barcode label sheets — pick products, size, copies, cut lines; prints
// CODE128 stickers exactly like the legacy barcode page.
function BarcodeLabelsModal({ open, onClose, products, currency }: {
  open: boolean; onClose: () => void; products: Product[]; currency: string;
}) {
  const withCodes = products.filter((p) => p.barcode);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [size, setSize] = useState<LabelSize>("medium");
  const [copies, setCopies] = useState(1);
  const [cutLines, setCutLines] = useState(true);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function run() {
    const items = withCodes
      .filter((p) => selected.has(p.id))
      .map((p) => ({ name: p.name, barcode: p.barcode, priceLabel: fmtMoney(p.price, currency) }));
    if (!items.length) return;
    if (!printBarcodeLabels(items, { size, copies: Math.max(1, copies), cutLines })) {
      alert("Allow pop-ups for this site to print labels.");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Print barcode labels" subtitle={`${withCodes.length} products have barcodes — pick the ones to print`} wide>
      <div className="flex items-center gap-2 mb-2">
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(withCodes.map((p) => p.id)))}>Select all</Button>
        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
        <span className="ml-auto text-[12px] text-t3">{selected.size} selected</span>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-ctl border border-line divide-y divide-line mb-3">
        {withCodes.map((p) => (
          <button key={p.id} type="button" onClick={() => toggle(p.id)}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 transition-colors">
            <span className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0",
              selected.has(p.id) ? "bg-primary border-primary text-white" : "border-line-2")}>
              {selected.has(p.id) && <span className="text-[10px] font-bold">✓</span>}
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium text-t1 truncate">{p.name}</span>
            <span className="font-mono text-[11px] text-t4 shrink-0">{p.barcode}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Label size">
          <Select value={size} onChange={(e) => setSize(e.target.value as LabelSize)}>
            <option value="small">Small · 4 per row</option>
            <option value="medium">Medium · 3 per row</option>
            <option value="large">Large · 2 per row</option>
            <option value="sheet">Sheet · 5 per row</option>
          </Select>
        </Field>
        <Field label="Copies each">
          <Input type="number" min="1" max="50" value={copies} onChange={(e) => setCopies(Number(e.target.value) || 1)} />
        </Field>
        <Field label="Cut lines">
          <button type="button" onClick={() => setCutLines((v) => !v)}
            className="w-full h-10 rounded-ctl border border-line-2 bg-surface-2 text-[13px] font-semibold text-t1">
            {cutLines ? "Dashed guides on" : "Off"}
          </button>
        </Field>
      </div>
      <Button className="w-full mt-4" onClick={run} disabled={!selected.size}>
        <Barcode className="w-4 h-4" /> Print {selected.size * Math.max(1, copies) || ""} label{selected.size * copies === 1 ? "" : "s"}
      </Button>
    </Modal>
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
    // Made-to-order items carry no stock — the stock report is shelf goods only.
    const rows = products.filter((p) => p.stock !== null && (excludeZero ? p.stock > 0 : true));
    const columns = [
      { label: "#", align: "left" as const, render: (_p: Product, i: number) => mono(String(i + 1)) },
      { label: "Product", render: (p: Product) => `<b>${p.name}</b>` },
      ...(cols.category ? [{ label: "Category", render: (p: Product) => p.category || "—" }] : []),
      ...(cols.stock ? [{
        label: "Stock", align: "right" as const,
        render: (p: Product) => {
          const stock = p.stock ?? 0;
          const color = stock <= 0 ? "#dc2626" : stock <= p.reorderLevel ? "#d97706" : "#059669";
          return `<span style="color:${color};font-family:'Courier New',monospace;font-weight:700">${stock}</span>`;
        },
      }] : []),
      ...(cols.price ? [{ label: "Price", align: "right" as const, render: (p: Product) => mono(fmtMoney(p.price, currency)) }] : []),
      ...(cols.cost && showCost ? [{ label: "Cost", align: "right" as const, render: (p: Product) => mono(fmtMoney(p.cost || 0, currency)) }] : []),
      ...(cols.value && showCost ? [{ label: "Stock Value", align: "right" as const, render: (p: Product) => mono(fmtMoney((p.cost || 0) * (p.stock ?? 0), currency)) }] : []),
      ...(cols.expiry && showExpiry ? [{ label: "Expiry", align: "right" as const, render: (p: Product) => (p.expiry ? fmtDate(p.expiry) : "—") }] : []),
      ...(cols.status ? [{
        label: "Status", align: "center" as const,
        render: (p: Product) => {
          const stock = p.stock ?? 0;
          const [label, color] = stock <= 0 ? ["Out of Stock", "#dc2626"] : stock <= p.reorderLevel ? ["Low Stock", "#d97706"] : ["Available", "#059669"];
          return `<span style="color:${color};font-weight:700;font-size:11px">${label}</span>`;
        },
      }] : []),
    ];
    const totals = columns.map((c) =>
      c.label === "#" ? "Total" :
      c.label === "Stock" ? String(rows.reduce((s, p) => s + (p.stock ?? 0), 0)) :
      c.label === "Stock Value" ? fmtMoney(rows.reduce((s, p) => s + (p.cost || 0) * (p.stock ?? 0), 0), currency) : ""
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

function ImportModal({ open, onClose, onDone, categories }: {
  open: boolean; onClose: () => void; onDone: () => void; categories: string[];
}) {
  const { activeBusiness, activeBranch, currency } = useSession();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const words = typeMeta(activeBusiness?.typeKey);

  function reset() {
    setRows([]); setFileName(""); setError(""); setResult(null);
  }

  function downloadTemplate() {
    downloadProductTemplate({
      businessName: activeBusiness?.name || "StarTrack",
      currency,
      categories,
      productWord: words.products,
      branchName: activeBranch?.name || "this branch",
    });
  }

  // Numbers may arrive with the thousands separators and currency symbols
  // people naturally type into a spreadsheet — "₦2,000" has to mean 2000.
  const num = (v: string, fallback: number) => {
    const cleaned = String(v ?? "").replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    return cleaned === "" || Number.isNaN(n) ? fallback : n;
  };

  const mapRows = (parsed: Record<string, string>[]) =>
    parsed.map((r) => ({
      name: pick(r, "name", "product", "productname", "item"),
      category: pick(r, "category", "cat") || "General",
      barcode: pick(r, "barcode", "sku", "code"),
      price: num(pick(r, "price", "sellingprice", "sellprice"), 0),
      cost: num(pick(r, "cost", "costprice"), 0),
      reorderLevel: num(pick(r, "reorderlevel", "reorder"), 5),
      openingStock: num(pick(r, "openingstock", "stock", "qty", "quantity"), 0),
      expiry: pick(r, "expiry", "expirydate"),
    }));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setResult(null); setFileName(file.name); setReading(true);
    try {
      const isExcel = /\.xlsx$/i.test(file.name);
      if (/\.xls$/i.test(file.name)) {
        throw new Error("That's the older .xls format. Open it in Excel and save as .xlsx or CSV, then try again.");
      }
      const parsed = isExcel ? await parseXlsx(file) : parseCsv(await file.text());
      if (!parsed.length) {
        setError("Couldn't read any rows. Check the first row holds the column names — the template has them already.");
        setRows([]);
        return;
      }
      setRows(mapRows(parsed));
    } catch (err: any) {
      setError(err.message || "Couldn't read that file.");
      setRows([]);
    } finally {
      setReading(false);
    }
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

          {/* Step 1 — the template does the explaining, so it leads. */}
          <div className="flex items-start gap-3 p-4 rounded-card bg-primary-softer border border-line">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-[13px]">1</div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-t1">Start from the template</div>
              <div className="text-[12px] text-t3 mt-0.5 leading-relaxed">
                An Excel workbook set up for {activeBusiness?.name || "your business"} — your categories as a dropdown,
                prices in {currency}, and a tab explaining every column.
              </div>
              <Button size="sm" variant="secondary" className="mt-2.5" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" /> Download Excel template
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 mt-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-surface-3 text-t3 flex items-center justify-center font-bold text-[13px]">2</div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-t1">Fill it in and upload it back</div>
              <label
                className={cn(
                  "mt-2 flex flex-col items-center justify-center gap-1.5 py-8 rounded-card border-2 border-dashed transition-colors",
                  reading ? "border-brand-400 bg-primary-softer cursor-wait" : "border-line-2 cursor-pointer hover:border-brand-400 hover:bg-primary-softer"
                )}
              >
                <FileSpreadsheet className={cn("w-7 h-7", reading ? "text-primary animate-pulse" : "text-t3")} />
                <span className="text-[13px] font-semibold text-t1">
                  {reading ? `Reading ${fileName}…` : "Choose a file"}
                </span>
                <span className="text-[12px] text-t3">Excel (.xlsx) or CSV · up to 2,000 items</span>
                <input type="file" accept=".xlsx,.csv,text/csv" className="hidden" disabled={reading} onChange={onFile} />
              </label>
              <div className="text-[11px] text-t4 mt-2">
                Already have a list from another system? Upload it as-is — columns named
                {" "}<span className="font-medium text-t3">product</span>, <span className="font-medium text-t3">qty</span> or
                {" "}<span className="font-medium text-t3">selling price</span> are recognised too. Nothing is saved until you
                check the preview.
              </div>
            </div>
          </div>
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
  editing, showCost, showExpiry, mtoAllowed, componentChoices, onClose, onSaved,
}: {
  editing: Product | "new" | null;
  showCost: boolean;
  showExpiry: boolean;
  mtoAllowed: boolean;
  componentChoices: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === "new";
  const p = isNew || !editing ? null : editing;
  const [mto, setMto] = useState(p?.archetype === "made_to_order");
  const [bom, setBom] = useState<BomLine[]>(p?.bom?.length ? p.bom : [{ productId: "", per: "sqm", factor: 1 }]);
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
  const setBomLine = (i: number, patch: Partial<BomLine>) =>
    setBom((b) => b.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const bomClean = bom
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, per: l.per, factor: Number(l.factor) || 1 }));
      if (mto && !bomClean.length) {
        setError("Add at least one component."); setBusy(false); return;
      }
      const body = {
        name: form.name.trim(),
        category: form.category.trim() || "General",
        barcode: mto ? "" : form.barcode.trim(),
        archetype: mto ? "made_to_order" : "stock",
        ...(mto ? { bom: bomClean } : {}),
        price: Number(form.price) || 0,
        cost: Number(form.cost) || 0,
        reorderLevel: Number(form.reorderLevel) || 0,
        ...(showExpiry && !mto ? { expiry: form.expiry } : {}),
        ...(isNew && !mto ? { openingStock: Number(form.openingStock) || 0 } : {}),
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
    <Modal open={!!editing} onClose={onClose} title={isNew ? "Add product" : `Edit ${p?.name}`} subtitle={isNew ? "It appears on the POS immediately" : "Price changes are logged to the audit trail"} wide={mto}>
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />

        {mtoAllowed && isNew && (
          <button
            type="button"
            onClick={() => setMto((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-ctl bg-surface-2 border border-line text-left hover:border-brand-300 transition-colors"
          >
            <span>
              <span className="block text-[13px] font-semibold text-t1">Made to order</span>
              <span className="block text-[11px] text-t3">Built per order from components (blinds, curtains, tailoring). Priced by size.</span>
            </span>
            <span className={cn("w-11 h-6 rounded-full transition-colors relative shrink-0", mto ? "bg-primary" : "bg-surface-3 border border-line-2")}>
              <span className={cn("absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all", mto ? "left-[22px]" : "left-0.5")} />
            </span>
          </button>
        )}

        <Field label="Name"><Input autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={mto ? "e.g. Day & Night Window Blind" : "e.g. Golden Penny Semovita 2kg"} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder={mto ? "Blinds" : "Grains"} /></Field>
          {!mto && <Field label="Barcode" hint="Optional — scan into this box"><Input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} /></Field>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={mto ? "Price per m²" : "Selling price"} hint={mto ? "Order price = this × width × height (adjustable at sale)" : undefined}>
            <Input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          {showCost && !mto && <Field label="Cost price" hint="Only finance roles see this"><Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} /></Field>}
        </div>

        {mto ? (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-t3 mb-1.5">Components — your own recipe</div>
            <div className="text-[11px] text-t4 mb-2">Cost and stock deduction come from these. Quantities are calculated from each order's size.</div>
            <div className="space-y-2">
              {bom.map((line, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={line.productId} onChange={(e) => setBomLine(i, { productId: e.target.value })} className="flex-1" required>
                    <option value="">Choose component…</option>
                    {componentChoices.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Select value={line.per} onChange={(e) => setBomLine(i, { per: e.target.value as BomLine["per"] })} className="!w-44">
                    {Object.entries(PER_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </Select>
                  <Input type="number" min="0.01" step="0.01" value={line.factor} onChange={(e) => setBomLine(i, { factor: Number(e.target.value) })} className="!w-20 text-right" title="Multiplier (e.g. 1.1 = 10% wastage)" />
                  {bom.length > 1 && (
                    <button type="button" onClick={() => setBom((b) => b.filter((_, idx) => idx !== i))} className="h-10 w-9 shrink-0 rounded-ctl border border-line-2 flex items-center justify-center text-t4 hover:text-danger">×</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setBom((b) => [...b, { productId: "", per: "unit", factor: 1 }])} className="mt-2 text-[12px] font-semibold text-primary hover:underline">
              + Add component
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reorder level" hint="Low-stock alert threshold"><Input type="number" min="0" value={form.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value)} /></Field>
              {isNew && <Field label="Opening stock" hint="Booked as a stock-in"><Input type="number" min="0" value={form.openingStock} onChange={(e) => set("openingStock", e.target.value)} /></Field>}
            </div>
            {showExpiry && (
              <Field label="Expiry date" hint="Optional — feeds the expiring-soon report">
                <Input type="date" value={form.expiry} onChange={(e) => set("expiry", e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : isNew ? "Add product" : "Save changes"}</Button>
      </form>
    </Modal>
  );
}
