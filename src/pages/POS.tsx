import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  ScanLine,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type Product = { id: string; name: string; price: number; cat: string; stock: number };

const PRODUCTS: Product[] = [
  { id: "p1", name: "Golden Penny Semovita 2kg", price: 2000, cat: "Grains", stock: 40 },
  { id: "p2", name: "Peak Milk 400g", price: 1500, cat: "Dairy", stock: 24 },
  { id: "p3", name: "Indomie Chicken (carton)", price: 3500, cat: "Grains", stock: 12 },
  { id: "p4", name: "Kings Oil 5L", price: 7500, cat: "Oils", stock: 3 },
  { id: "p5", name: "Dangote Sugar 1kg", price: 900, cat: "Baking", stock: 5 },
  { id: "p6", name: "Titus Sardine", price: 1200, cat: "Canned", stock: 6 },
  { id: "p7", name: "Milo 500g", price: 2800, cat: "Dairy", stock: 18 },
  { id: "p8", name: "Golden Penny Flour 1kg", price: 1100, cat: "Baking", stock: 2 },
  { id: "p9", name: "Maggi Cube (roll)", price: 600, cat: "Spices", stock: 60 },
  { id: "p10", name: "Power Oil 3.5L", price: 6200, cat: "Oils", stock: 15 },
  { id: "p11", name: "Bournvita 900g", price: 4200, cat: "Dairy", stock: 9 },
  { id: "p12", name: "Honeywell Noodles", price: 400, cat: "Grains", stock: 80 },
];

const CATS = ["All", "Grains", "Dairy", "Oils", "Baking", "Canned", "Spices"];
const naira = (n: number) => "₦" + n.toLocaleString("en-NG");

type Line = Product & { qty: number };

export function POS() {
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [pay, setPay] = useState<"Cash" | "POS" | "Transfer">("Cash");
  const [discount, setDiscount] = useState(0);
  const [done, setDone] = useState(false);

  const filtered = useMemo(
    () =>
      PRODUCTS.filter(
        (p) => (cat === "All" || p.cat === cat) && p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [cat, q]
  );

  const add = (p: Product) => {
    if (p.stock <= 0) return;
    setCart((c) => {
      const ex = c.find((l) => l.id === p.id);
      if (ex) return c.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { ...p, qty: 1 }];
    });
  };
  const setQty = (id: string, d: number) =>
    setCart((c) =>
      c.map((l) => (l.id === id ? { ...l, qty: Math.max(1, l.qty + d) } : l)).filter((l) => l.qty > 0)
    );
  const remove = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const total = Math.max(0, subtotal - discount);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const checkout = () => {
    if (!cart.length) return;
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setCart([]);
      setDiscount(0);
    }, 1600);
  };

  return (
    <div className="h-full flex">
      {/* LEFT: products */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* toolbar */}
        <div className="p-4 border-b border-line bg-surface flex items-center gap-3">
          <button className="w-10 h-10 rounded-ctl border border-line-2 flex items-center justify-center text-t3 hover:text-primary hover:border-brand-400 transition-colors shrink-0" title="Scan barcode">
            <ScanLine className="w-[18px] h-[18px]" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products…"
              className="w-full h-10 pl-9 pr-3 rounded-ctl bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer"
            />
          </div>
        </div>

        {/* categories */}
        <div className="px-4 py-3 border-b border-line bg-surface flex gap-2 overflow-x-auto">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "px-3.5 h-8 rounded-full text-[12px] font-semibold whitespace-nowrap border transition-colors",
                cat === c
                  ? "bg-primary-soft border-brand-400 text-primary"
                  : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {filtered.map((p) => {
              const oos = p.stock <= 0;
              const low = p.stock > 0 && p.stock <= 5;
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
                  <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center mb-3">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="text-[13px] font-semibold text-t1 leading-tight line-clamp-2 h-9">{p.name}</div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono font-bold text-[14px] text-primary">{naira(p.price)}</span>
                    <span className="text-[11px] text-t4">{p.stock} left</span>
                  </div>
                  <span className="absolute bottom-3 right-3 w-6 h-6 rounded-lg bg-primary text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="w-4 h-4" />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: cart */}
      <aside className="w-[360px] shrink-0 border-l border-line bg-surface flex flex-col">
        <div className="p-4 border-b border-line flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <span className="font-bold text-[14px] text-t1">Current Sale</span>
          {count > 0 && <span className="ml-auto"><Badge tone="brand">{count} items</Badge></span>}
        </div>

        {/* lines */}
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
                    <span className="font-mono font-bold text-[14px] text-t1 tabular-nums">{naira(l.price * l.qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-line p-4 space-y-3">
          {/* payment methods */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { k: "Cash", icon: Banknote },
              { k: "POS", icon: CreditCard },
              { k: "Transfer", icon: Smartphone },
            ] as const).map(({ k, icon: Icon }) => (
              <button
                key={k}
                onClick={() => setPay(k)}
                className={cn(
                  "h-11 rounded-ctl border flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors",
                  pay === k ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"
                )}
              >
                <Icon className="w-4 h-4" />
                {k}
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
              <span className="font-mono tabular-nums">{naira(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-[12px] text-danger">
                <span>Discount</span>
                <span className="font-mono tabular-nums">−{naira(discount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1.5 border-t border-line">
              <span className="text-[13px] font-bold text-t1">Total</span>
              <span className="font-mono font-extrabold text-[18px] text-primary tabular-nums">{naira(total)}</span>
            </div>
          </div>

          <Button variant="success" size="lg" className="w-full" onClick={checkout} disabled={!cart.length || done}>
            {done ? (
              <><CheckCircle2 className="w-5 h-5" /> Sale complete!</>
            ) : (
              <><CheckCircle2 className="w-5 h-5" /> Complete Sale · {naira(total)}</>
            )}
          </Button>
        </div>
      </aside>
    </div>
  );
}
