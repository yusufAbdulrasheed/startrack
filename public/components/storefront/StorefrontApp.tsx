import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Home, ReceiptText, ShoppingBasket, Store as StoreIcon, User, X } from "lucide-react";
import { SiteView } from "@/components/site/SiteView";
import { fmtMoney } from "@/lib/format";
import type { SiteData } from "@/lib/site";
import { createShopApi, getShopToken, loadCart, saveCart, setShopToken, type CartLine, type Gate, type ShopProduct, type Shopper, type StoreConfig } from "@/lib/shop";
import { AccountTab } from "./AccountTab";
import { AuthGate } from "./AuthGate";
import { Button, Spinner, Stepper, Thumb } from "./bits";
import { CheckoutTab } from "./CheckoutTab";
import { StoreProvider, ThemeProvider, useStore, type Tab } from "./context";
import { OrdersTab } from "./OrdersTab";
import { ShopTab } from "./ShopTab";
import { storeTheme } from "./theme";

const TABS: Tab[] = ["home", "shop", "checkout", "orders", "account"];
const tabFromHash = (): Tab => {
  const h = window.location.hash.replace("#", "").split("/")[0] as Tab;
  return TABS.includes(h) && h !== "home" ? h : "home";
};

/**
 * A business's page when it runs an online store. A stranger gets the sign-in
 * wall; a signed-in customer gets the full page, the shop, checkout, their
 * orders and their account — all in the business's own colours.
 */
export function StorefrontApp({ slug, gate }: { slug: string; gate: Gate }) {
  const theme = useMemo(() => storeTheme(gate.accent, gate.mode), [gate.accent, gate.mode]);
  const [shopper, setShopper] = useState<Shopper | null>(null);
  const [site, setSite] = useState<SiteData | null>(null);
  const [store, setStore] = useState<StoreConfig | null>(null);
  const [booting, setBooting] = useState(!!getShopToken(slug));
  const [loadError, setLoadError] = useState("");

  const signOutRef = useRef<() => void>(() => {});
  const api = useMemo(() => createShopApi(slug, () => signOutRef.current()), [slug]);

  const signOut = useCallback(() => {
    setShopToken(slug, null);
    setShopper(null); setSite(null); setStore(null);
    window.location.hash = "";
  }, [slug]);
  signOutRef.current = signOut;

  const enter = useCallback(async () => {
    const r = await api.site();
    setSite(r.site); setStore(r.store); setShopper(r.shopper);
  }, [api]);

  // Returning customer: pick the session back up.
  useEffect(() => {
    if (!getShopToken(slug)) return;
    enter().catch((e) => { if (e?.status !== 401) setLoadError(e.message || "Couldn't open the shop."); }).finally(() => setBooting(false));
  }, [slug, enter]);

  if (booting) return <div className="min-h-full grid place-items-center" style={{ background: theme.bg }}><Spinner t={theme} /></div>;

  return (
    <ThemeProvider value={theme}>
      {!shopper || !site || !store ? (
        <>
          {loadError && <div className="px-4 py-3 text-center text-[13.5px] font-semibold" style={{ background: theme.danger, color: "#fff" }}>{loadError}</div>}
          <AuthGate gate={gate} api={api} onAuthed={(token, s) => { setShopToken(slug, token); setShopper(s); enter().catch((e) => setLoadError(e.message)); }} />
        </>
      ) : (
        <Shell slug={slug} gate={gate} api={api} shopper={shopper} setShopper={setShopper} site={site} store={store} signOut={signOut} />
      )}
    </ThemeProvider>
  );
}

function Shell({ slug, gate, api, shopper, setShopper, site, store, signOut }: {
  slug: string; gate: Gate; api: ReturnType<typeof createShopApi>; shopper: Shopper; setShopper: (s: Shopper) => void; site: SiteData; store: StoreConfig; signOut: () => void;
}) {
  const theme = useMemo(() => storeTheme(gate.accent, gate.mode), [gate.accent, gate.mode]);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [cart, setCartState] = useState<CartLine[]>(() => loadCart(slug));
  const [cartOpen, setCartOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { saveCart(slug, cart); }, [slug, cart]);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab, focusOrderId]);
  useEffect(() => {
    document.title = `${gate.name}${tab === "home" ? "" : ` · ${tab[0].toUpperCase()}${tab.slice(1)}`}`;
  }, [gate.name, tab]);

  const money = useCallback((n: number) => fmtMoney(n, store.currency), [store.currency]);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const go = useCallback((t: Tab, orderId: string | null = null) => {
    setFocusOrderId(orderId);
    setCartOpen(false);
    window.location.hash = t === "home" ? "" : t;
    setTab(t);
  }, []);

  const setCart = useCallback((c: CartLine[]) => setCartState(c.filter((l) => l.qty > 0).slice(0, 40)), []);
  const addToCart = useCallback((p: ShopProduct, qty = 1) => {
    setCartState((prev) => {
      const ex = prev.find((l) => l.id === p.id);
      if (ex) return prev.map((l) => (l.id === p.id ? { ...l, qty: Math.min(99, l.qty + qty) } : l));
      return [...prev, { id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl, qty }];
    });
    toast(`${p.name} added to your basket`);
  }, [toast]);
  const setQty = useCallback((id: string, qty: number) => setCartState((prev) => prev.flatMap((l) => (l.id !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(99, qty) }]))), []);

  const cartCount = cart.reduce((n, l) => n + l.qty, 0);
  const cartTotal = cart.reduce((n, l) => n + l.qty * l.price, 0);

  const ctx = {
    slug, gate, theme, api, shopper, setShopper, store, cart, cartCount, cartTotal, addToCart, setQty, setCart,
    clearCart: () => setCartState([]), openCart: () => setCartOpen(true), go, focusOrderId, signOut, toast, money,
  };

  const header = <Header active={tab} />;

  return (
    <StoreProvider value={ctx}>
      <div className="min-h-full w-full" style={{ background: theme.bg, color: theme.text, fontFamily: "var(--st-font-sans, inherit)" }}>
        {tab === "home" ? (
          <SiteView data={site} storeHeader={header} shopLink />
        ) : (
          <>
            {gate.announcement && <div className="px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: theme.dark ? "#1b2150" : "#111827", color: "#fff" }}>{gate.announcement}</div>}
            {header}
            {tab === "shop" && <ShopTab />}
            {tab === "checkout" && <CheckoutTab />}
            {tab === "orders" && <OrdersTab />}
            {tab === "account" && <AccountTab />}
          </>
        )}

        <BottomNav active={tab} />
        {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
        {toastMsg && (
          <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-[60] px-5 py-3 rounded-full text-[13.5px] font-bold shadow-xl max-w-[92vw] text-center" style={{ background: "#111827", color: "#fff" }}>{toastMsg}</div>
        )}
      </div>
    </StoreProvider>
  );
}

function Header({ active }: { active: Tab }) {
  const { gate, theme: t, go, cartCount, openCart, shopper } = useStore();
  const links: [Tab, string][] = [["home", "Home"], ["shop", "Shop"], ["orders", "My orders"]];
  return (
    <header className="sticky top-0 z-40" style={{ background: t.dark ? "rgba(11,14,31,0.86)" : "rgba(255,255,255,0.9)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${t.line}` }}>
      <div className="flex items-center gap-3 px-4 lg:px-10 h-[68px] max-w-[1240px] mx-auto">
        <button onClick={() => go("home")} className="flex items-center gap-3 min-w-0" aria-label={`${gate.name} home`}>
          {gate.logoUrl
            ? <img src={gate.logoUrl} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-xl object-cover" />
            : <span className="w-10 h-10 rounded-xl grid place-items-center font-extrabold text-[16px]" style={{ background: t.accent, color: t.onAccent }}>{gate.name.slice(0, 1).toUpperCase()}</span>}
          <span className="font-extrabold text-[17px] tracking-[-0.01em] truncate">{gate.name}</span>
        </button>
        <nav className="hidden lg:flex items-center gap-1 ml-8" aria-label="Store">
          {links.map(([k, label]) => (
            <button key={k} onClick={() => go(k)} aria-current={active === k ? "page" : undefined} className="px-4 py-2 rounded-full text-[14px] font-bold transition-colors" style={active === k ? { background: t.soft, color: t.accent } : { color: t.muted }}>{label}</button>
          ))}
        </nav>
        <span className="ml-auto" />
        <button onClick={() => go("account")} className="hidden lg:flex items-center gap-2 h-10 pl-1.5 pr-3.5 rounded-full text-[13.5px] font-bold" style={{ background: t.soft, color: t.text }}>
          <span className="w-7 h-7 rounded-full grid place-items-center text-[12px] font-extrabold" style={{ background: t.accent, color: t.onAccent }}>{shopper.name.slice(0, 1).toUpperCase()}</span>{shopper.name.split(" ")[0]}
        </button>
        <button onClick={openCart} aria-label={`Basket, ${cartCount} items`} className="relative grid place-items-center w-11 h-11 rounded-full" style={{ background: t.accent, color: t.onAccent }}>
          <ShoppingBasket className="w-5 h-5" />
          {cartCount > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full grid place-items-center text-[11px] font-extrabold" style={{ background: "#111827", color: "#fff", border: `2px solid ${t.dark ? "#0b0e1f" : "#fff"}` }}>{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}

function BottomNav({ active }: { active: Tab }) {
  const { theme: t, go } = useStore();
  const items: [Tab, string, typeof Home][] = [["home", "Home", Home], ["shop", "Shop", StoreIcon], ["orders", "Orders", ReceiptText], ["account", "Account", User]];
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 h-[68px] pb-[env(safe-area-inset-bottom)]" style={{ background: t.dark ? "rgba(11,14,31,0.94)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(14px)", borderTop: `1px solid ${t.line}` }} aria-label="Store">
      {items.map(([k, label, Icon]) => {
        const on = active === k || (k === "shop" && active === "checkout");
        return (
          <button key={k} onClick={() => go(k)} aria-current={on ? "page" : undefined} className="flex flex-col items-center justify-center gap-1 text-[11px] font-bold" style={{ color: on ? t.accent : t.muted }}>
            <span className="grid place-items-center w-12 h-7 rounded-full" style={on ? { background: t.soft } : undefined}><Icon className="w-[19px] h-[19px]" strokeWidth={on ? 2.4 : 2} /></span>{label}
          </button>
        );
      })}
    </nav>
  );
}

function CartDrawer({ onClose }: { onClose: () => void }) {
  const { theme: t, cart, setQty, cartTotal, cartCount, go, money } = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Your basket">
      <button className="flex-1 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-label="Close basket" />
      <aside className="w-full max-w-[440px] h-full flex flex-col" style={{ background: t.bg, color: t.text }}>
        <header className="flex items-center justify-between px-5 h-[68px] shrink-0" style={{ borderBottom: `1px solid ${t.line}` }}>
          <h2 className="text-[18px] font-extrabold">Your basket {cartCount > 0 && <span style={{ color: t.muted }}>({cartCount})</span>}</h2>
          <button onClick={onClose} aria-label="Close" className="p-2 -mr-2"><X className="w-5 h-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5">
          {!cart.length ? (
            <div className="py-24 text-center">
              <span className="mx-auto grid place-items-center w-16 h-16 rounded-3xl" style={{ background: t.soft, color: t.accent }}><ShoppingBasket className="w-7 h-7" /></span>
              <p className="mt-4 font-extrabold text-[17px]">Your basket is empty</p>
              <Button className="mt-5" onClick={() => go("shop")}>Browse the shop</Button>
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: t.line }}>
              {cart.map((l) => (
                <li key={l.id} className="py-4 flex items-center gap-3" style={{ borderColor: t.line }}>
                  <Thumb name={l.name} url={l.imageUrl} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[14.5px] leading-snug line-clamp-2">{l.name}</div>
                    <div className="text-[13px] font-bold mt-0.5 tabular-nums" style={{ color: t.accent }}>{money(l.price * l.qty)}</div>
                  </div>
                  <Stepper small qty={l.qty} onChange={(n) => setQty(l.id, n)} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {cart.length > 0 && (
          <footer className="p-5 shrink-0" style={{ borderTop: `1px solid ${t.line}`, background: t.surface }}>
            <div className="flex items-center justify-between text-[16px] font-extrabold"><span>Subtotal</span><span className="tabular-nums">{money(cartTotal)}</span></div>
            <p className="text-[12.5px] mt-1" style={{ color: t.muted }}>Delivery, if any, is added at checkout.</p>
            <Button full className="mt-4" onClick={() => go("checkout")}>Go to checkout</Button>
          </footer>
        )}
      </aside>
    </div>
  );
}
