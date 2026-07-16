import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Banknote, CreditCard, Smartphone,
  CheckCircle2, ScanLine, Package, UserPlus, Printer, X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { Spinner, EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string; price: number; category: string; stock: number; barcode: string };
type Line = { id: string; name: string; price: number; stock: number; qty: number };
type Receipt = {
  saleNo: string; businessName: string; at: string; staffName: string; customerName: string;
  items: { name: string; qty: number; unitPrice: number; lineNet: number }[];
  subtotal: number; discount: number; vat: number; total: number;
  payments: { method: string; amount: number }[];
  footer: string; currency: string;
};

const PAY_METHODS = [
  { k: "cash", label: "Cash", icon: Banknote },
  { k: "pos", label: "POS", icon: CreditCard },
  { k: "transfer", label: "Transfer", icon: Smartphone },
] as const;

export function POS() {
  const { activeBusiness, activeBranch, currency } = useSession();
  const { data, loading, reload } = useApi<{ products: Product[] }>("/products", [activeBranch?.id]);
  const products = data?.products || [];

  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [pay, setPay] = useState<"cash" | "pos" | "transfer">("cash");
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const cats = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category))).sort()], [products]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (cat === "All" || p.category === cat) &&
          (p.name.toLowerCase().includes(q.toLowerCase()) || (q && p.barcode === q))
      ),
    [products, cat, q]
  );

  // Barcode scanners are keyboards: exact barcode match + Enter adds instantly.
  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !q) return;
    const exact = products.find((p) => p.barcode && p.barcode === q.trim());
    if (exact) {
      add(exact);
      setQ("");
    } else if (filtered.length === 1) {
      add(filtered[0]);
      setQ("");
    }
  }

  const inCart = (id: string) => cart.find((l) => l.id === id)?.qty || 0;

  const add = (p: Product) => {
    if (p.stock - inCart(p.id) <= 0) return;
    setError("");
    setCart((c) => {
      const ex = c.find((l) => l.id === p.id);
      if (ex) return c.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { id: p.id, name: p.name, price: p.price, stock: p.stock, qty: 1 }];
    });
  };
  const setQty = (id: string, d: number) =>
    setCart((c) =>
      c
        .map((l) => (l.id === id ? { ...l, qty: Math.min(l.stock, Math.max(0, l.qty + d)) } : l))
        .filter((l) => l.qty > 0)
    );
  const remove = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const safeDiscount = Math.min(discount, subtotal);
  const vatRate = activeBusiness?.settings.vatEnabled ? activeBusiness.settings.vatRate : 0;
  const vat = Math.round((subtotal - safeDiscount) * vatRate) / 100;
  const total = Math.round((subtotal - safeDiscount + vat) * 100) / 100;
  const count = cart.reduce((s, l) => s + l.qty, 0);

  async function checkout() {
    if (!cart.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<{ receipt: Receipt }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((l) => ({ productId: l.id, qty: l.qty })),
          discount: safeDiscount,
          payments: [{ method: pay, amount: total }],
          ...(customer?.name ? { customer } : {}),
          clientSaleId: crypto.randomUUID(),
        }),
      });
      setReceipt(res.receipt);
      setCart([]);
      setDiscount(0);
      setCustomer(null);
      reload();
    } catch (err: any) {
      setError(err.message || "Checkout failed");
      if (err.code === "insufficient_stock") reload();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <div className="h-full flex">
      {/* LEFT: products */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-line bg-surface flex items-center gap-3">
          <div className="w-10 h-10 rounded-ctl border border-line-2 flex items-center justify-center text-t3 shrink-0" title="Scan barcode — scanners type into search">
            <ScanLine className="w-[18px] h-[18px]" />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Search or scan…"
              className="w-full h-10 pl-9 pr-3 rounded-ctl bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
            />
          </div>
        </div>

        <div className="px-4 py-3 border-b border-line bg-surface flex gap-2 overflow-x-auto">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-3.5 h-8 rounded-full text-[12px] font-semibold whitespace-nowrap border transition-colors",
                cat === c ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <Spinner />
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="No products yet" body="Add products on the Products page (or ask your manager to) and they'll appear here, ready to sell." />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {filtered.map((p) => {
                const left = p.stock - inCart(p.id);
                const oos = left <= 0;
                const low = left > 0 && left <= 5;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    disabled={oos}
                    className={cn(
                      "group relative text-left bg-surface border border-line rounded-card p-4 transition-all duration-150",
                      oos ? "opacity-40 cursor-not-allowed" : "hover:border-brand-400 hover:shadow-e1 hover:-translate-y-0.5 active:translate-y-0"
                    )}
                  >
                    {low && <span className="absolute top-2.5 right-2.5"><Badge tone="warning">Low</Badge></span>}
                    {oos && <span className="absolute top-2.5 right-2.5"><Badge tone="danger">Out</Badge></span>}
                    <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center mb-3">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="text-[13px] font-semibold text-t1 leading-tight line-clamp-2 h-9">{p.name}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono font-bold text-[14px] text-primary">{fmtMoney(p.price, currency)}</span>
                      <span className="text-[11px] text-t4">{left} left</span>
                    </div>
                    <span className="absolute bottom-3 right-3 w-6 h-6 rounded-lg bg-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="w-4 h-4" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: cart */}
      <aside className="w-[360px] shrink-0 border-l border-line bg-surface flex flex-col">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <span className="font-bold text-[14px] text-t1">Current Sale</span>
          {count > 0 && <span className="ml-auto"><Badge tone="brand">{count} items</Badge></span>}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-surface-3 text-t4 flex items-center justify-center mb-3">
                <ShoppingCart className="w-7 h-7" />
              </div>
              <div className="text-[13px] font-semibold text-t2">Cart is empty</div>
              <div className="text-[12px] text-t4 mt-1">Tap a product to add it to the sale</div>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((l) => (
                <div key={l.id} className="bg-surface-2 border border-line rounded-xl p-3 animate-fade-in">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold text-t1 leading-tight">{l.name}</span>
                    <button onClick={() => remove(l.id)} className="text-t4 hover:text-danger transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setQty(l.id, -1)} className="w-7 h-7 rounded-lg border border-line-2 bg-surface flex items-center justify-center text-t2 hover:border-brand-400 hover:text-primary transition-colors">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-[13px] text-t1">{l.qty}</span>
                      <button onClick={() => setQty(l.id, 1)} className="w-7 h-7 rounded-lg border border-line-2 bg-surface flex items-center justify-center text-t2 hover:border-brand-400 hover:text-primary transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="font-mono font-bold text-[14px] text-t1 tabular-nums">{fmtMoney(l.price * l.qty, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line p-4 space-y-3">
          {/* customer */}
          {customer ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-ctl bg-primary-softer border border-line text-[12px]">
              <UserPlus className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="font-semibold text-t1 truncate">{customer.name}</span>
              {customer.phone && <span className="text-t3">{customer.phone}</span>}
              <button onClick={() => setCustomer(null)} className="ml-auto text-t4 hover:text-danger"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setCustomerOpen(true)} className="w-full flex items-center gap-2 px-3 h-9 rounded-ctl border border-dashed border-line-2 text-[12px] font-semibold text-t3 hover:text-primary hover:border-brand-400 transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Attach customer (optional)
            </button>
          )}

          {/* payment methods */}
          <div className="grid grid-cols-3 gap-2">
            {PAY_METHODS.map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                onClick={() => setPay(k)}
                className={cn(
                  "h-11 rounded-ctl border flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                  pay === k ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* discount */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-t3 shrink-0">Discount</span>
            <input
              type="number"
              value={discount || ""}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="flex-1 h-9 px-3 rounded-lg bg-surface-2 border border-line text-[13px] font-mono text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 text-right"
            />
          </div>

          {/* totals */}
          <div className="bg-surface-2 rounded-xl border border-line p-3 space-y-1.5">
            <div className="flex justify-between text-[12px] text-t2">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{fmtMoney(subtotal, currency)}</span>
            </div>
            {safeDiscount > 0 && (
              <div className="flex justify-between text-[12px] text-danger">
                <span>Discount</span>
                <span className="font-mono tabular-nums">−{fmtMoney(safeDiscount, currency)}</span>
              </div>
            )}
            {vatRate > 0 && (
              <div className="flex justify-between text-[12px] text-t2">
                <span>VAT ({vatRate}%)</span>
                <span className="font-mono tabular-nums">{fmtMoney(vat, currency)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-line">
              <span className="text-[13px] font-bold text-t1">Total</span>
              <span className="font-mono font-extrabold text-[18px] text-primary tabular-nums">{fmtMoney(total, currency)}</span>
            </div>
          </div>

          {error && <div className="px-3 py-2 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">{error}</div>}

          <Button variant="success" size="lg" className="w-full" onClick={checkout} disabled={!cart.length || busy}>
            <CheckCircle2 className="w-5 h-5" />
            {busy ? "Processing…" : `Complete Sale · ${fmtMoney(total, currency)}`}
          </Button>
        </div>
      </aside>

      {/* customer modal */}
      <CustomerQuickAdd open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={(c) => { setCustomer(c); setCustomerOpen(false); }} />

      {/* receipt modal */}
      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function CustomerQuickAdd({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: { name: string; phone: string }) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Attach a customer" subtitle="Builds their purchase history and spend automatically">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            onPick({ name: name.trim(), phone: phone.trim() });
            setName(""); setPhone("");
          }
        }}
        className="space-y-3"
      >
        <Input autoFocus placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="Phone / WhatsApp (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" className="w-full">Attach to sale</Button>
      </form>
    </Modal>
  );
}

export function ReceiptModal({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  if (!receipt) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] print:hidden" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface border border-line-2 rounded-2xl shadow-e2 animate-fade-up overflow-hidden print-receipt">
        <div className="p-6 text-center border-b border-dashed border-line-2">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2 print:hidden" />
          <div className="font-display text-[17px] font-extrabold text-t1">{receipt.businessName}</div>
          <div className="text-[11px] text-t3 mt-1 font-mono">{receipt.saleNo} · {fmtDateTime(receipt.at)}</div>
          <div className="text-[11px] text-t3">Served by {receipt.staffName}{receipt.customerName ? ` · for ${receipt.customerName}` : ""}</div>
        </div>
        <div className="p-5 space-y-1.5 max-h-[40vh] overflow-y-auto">
          {receipt.items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-[12px]">
              <span className="text-t2">{i.name} ×{i.qty}</span>
              <span className="font-mono text-t1 tabular-nums">{fmtMoney(i.lineNet, receipt.currency)}</span>
            </div>
          ))}
          <div className="pt-2 mt-2 border-t border-line space-y-1">
            <div className="flex justify-between text-[12px] text-t2"><span>Subtotal</span><span className="font-mono">{fmtMoney(receipt.subtotal, receipt.currency)}</span></div>
            {receipt.discount > 0 && <div className="flex justify-between text-[12px] text-danger"><span>Discount</span><span className="font-mono">−{fmtMoney(receipt.discount, receipt.currency)}</span></div>}
            {receipt.vat > 0 && <div className="flex justify-between text-[12px] text-t2"><span>VAT</span><span className="font-mono">{fmtMoney(receipt.vat, receipt.currency)}</span></div>}
            <div className="flex justify-between text-[15px] font-bold text-t1 pt-1"><span>Total</span><span className="font-mono">{fmtMoney(receipt.total, receipt.currency)}</span></div>
            <div className="flex justify-between text-[11px] text-t3">
              <span>Paid via {receipt.payments.map((p) => p.method.toUpperCase()).join(" + ")}</span>
            </div>
          </div>
          <div className="text-center text-[11px] text-t3 pt-3">{receipt.footer}</div>
        </div>
        <div className="p-4 border-t border-line grid grid-cols-2 gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}><Printer className="w-4 h-4" /> Print</Button>
          <Button onClick={onClose}>New Sale</Button>
        </div>
      </div>
    </div>
  );
}
