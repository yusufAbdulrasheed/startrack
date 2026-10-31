import { useCallback, useEffect, useRef, useState } from "react";
import { PackageOpen, Search, ShoppingBasket } from "lucide-react";
import type { Catalog, ShopProduct } from "@/lib/shop";
import { Button, Notice, Spinner, Stepper } from "./bits";
import { useStore } from "./context";

/** The shop window. Never shows cost or exact stock — only "sold out" and, when nearly gone, "only N left". */
export function ShopTab() {
  const { api, theme: t, store, cart, cartCount, cartTotal, addToCart, setQty, openCart, money, go } = useStore();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<Catalog | null>(null);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const seq = useRef(0);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    const mine = ++seq.current;
    setLoading(true);
    setError("");
    try {
      const r = await api.catalog({ q, category, page: nextPage });
      if (mine !== seq.current) return;
      setData(r);
      setPage(r.page);
      setItems((prev) => (append ? [...prev, ...r.products] : r.products));
    } catch (e: any) {
      if (mine === seq.current) setError(e.message || "Couldn't load the shop.");
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [api, q, category]);

  // Typing in the search box shouldn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => load(1, false), q ? 300 : 0);
    return () => clearTimeout(id);
  }, [load, q]);

  const qtyOf = (id: string) => cart.find((l) => l.id === id)?.qty || 0;

  return (
    <div className="max-w-[1240px] mx-auto px-4 lg:px-10 py-6 lg:py-10 pb-28 lg:pb-12">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[28px] lg:text-[36px] font-extrabold tracking-[-0.025em]">Shop</h1>
          <p className="text-[14.5px] mt-1" style={{ color: t.muted }}>{data ? `${data.total} item${data.total === 1 ? "" : "s"}` : " "}{store.leadTime ? ` · ${store.leadTime}` : ""}</p>
        </div>
        <label className="relative w-full sm:w-[340px]">
          <span className="sr-only">Search the shop</span>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: t.muted }} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…"
            className="w-full h-12 pl-11 pr-4 rounded-full text-[15px] outline-none"
            style={{ background: t.surface, color: t.text, border: `1.5px solid ${t.line}` }}
          />
        </label>
      </div>

      {!store.acceptingOrders && (
        <div className="mt-5"><Notice tone="info">This shop isn't taking new orders right now. You can still look around and check your orders.</Notice></div>
      )}

      {data && data.categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto mt-5 -mx-4 px-4 lg:mx-0 lg:px-0 pb-1" role="tablist" aria-label="Categories">
          {["", ...data.categories].map((c) => (
            <button
              key={c || "all"} role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
              className="h-10 px-4 rounded-full text-[13.5px] font-bold whitespace-nowrap shrink-0 transition-colors"
              style={category === c ? { background: t.accent, color: t.onAccent } : { background: t.surface, color: t.muted, border: `1px solid ${t.line}` }}
            >
              {c || "All"}
            </button>
          ))}
        </div>
      )}

      {error && <div className="mt-5"><Notice>{error}</Notice></div>}

      {loading && !items.length ? (
        <div className="py-24 grid place-items-center"><Spinner t={t} /></div>
      ) : !items.length ? (
        <div className="py-20 text-center">
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-3xl" style={{ background: t.soft, color: t.accent }}><PackageOpen className="w-7 h-7" /></span>
          <h2 className="mt-4 text-[19px] font-extrabold">{q || category ? "Nothing matches that" : "Nothing in the shop yet"}</h2>
          <p className="mt-1.5 text-[14.5px]" style={{ color: t.muted }}>{q || category ? "Try a different word or category." : "Check back soon."}</p>
          {(q || category) && <Button kind="soft" className="mt-5" onClick={() => { setQ(""); setCategory(""); }}>Clear search</Button>}
        </div>
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5 lg:gap-5">
            {items.map((p) => {
              const qty = qtyOf(p.id);
              return (
                <li key={p.id} className="flex flex-col overflow-hidden rounded-3xl" style={{ background: t.surface, border: `1px solid ${t.line}` }}>
                  <div className="relative aspect-square" style={{ background: t.soft }}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" style={p.available ? undefined : { opacity: 0.45 }} />
                      : <div className="w-full h-full grid place-items-center font-extrabold text-[44px]" style={{ color: t.accent, opacity: p.available ? 1 : 0.4 }}>{p.name.slice(0, 1).toUpperCase()}</div>}
                    {!p.available && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] font-bold" style={{ background: "#111827", color: "#fff" }}>Sold out</span>}
                    {p.left !== null && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11.5px] font-bold" style={{ background: t.danger, color: "#fff" }}>Only {p.left} left</span>}
                  </div>
                  <div className="p-3.5 lg:p-4 flex flex-col flex-1">
                    {p.category && <div className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: t.muted }}>{p.category}</div>}
                    <h3 className="mt-0.5 text-[14.5px] lg:text-[15.5px] font-bold leading-snug line-clamp-2">{p.name}</h3>
                    <div className="mt-1 text-[16px] lg:text-[17px] font-extrabold tabular-nums" style={{ color: t.accent }}>{money(p.price)}{p.unit && p.unit !== "unit" ? <span className="text-[12px] font-semibold" style={{ color: t.muted }}> / {p.unit}</span> : null}</div>
                    <div className="mt-auto pt-3">
                      {qty > 0 ? (
                        <Stepper small qty={qty} onChange={(n) => setQty(p.id, n)} max={p.left ?? 99} />
                      ) : (
                        <Button full className="!h-10 !text-[13.5px]" disabled={!p.available || !store.acceptingOrders} onClick={() => addToCart(p)}>
                          {p.available ? "Add to basket" : "Unavailable"}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {data && page < data.pages && (
            <div className="mt-8 grid place-items-center">
              <Button kind="ghost" disabled={loading} onClick={() => load(page + 1, true)}>{loading ? "Loading…" : "Show more"}</Button>
            </div>
          )}
        </>
      )}

      {/* The basket bar: always one tap away, especially on a phone. */}
      {cartCount > 0 && (
        <div className="fixed left-0 right-0 bottom-[76px] lg:bottom-6 z-30 px-4 pointer-events-none">
          <div className="max-w-[560px] mx-auto pointer-events-auto flex items-center gap-3 p-2.5 pl-5 rounded-full" style={{ background: t.accent, color: t.onAccent, boxShadow: `0 18px 40px -14px ${t.accent}` }}>
            <ShoppingBasket className="w-5 h-5 shrink-0" />
            <button className="flex-1 text-left" onClick={openCart}>
              <span className="block text-[13px] font-bold leading-tight">{cartCount} item{cartCount === 1 ? "" : "s"} in your basket</span>
              <span className="block text-[15px] font-extrabold leading-tight tabular-nums">{money(cartTotal)}</span>
            </button>
            <button onClick={() => go("checkout")} className="h-11 px-5 rounded-full text-[14px] font-extrabold" style={{ background: t.onAccent, color: t.accent }}>Checkout</button>
          </div>
        </div>
      )}
    </div>
  );
}

