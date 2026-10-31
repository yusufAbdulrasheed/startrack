import { createContext, useContext } from "react";
import type { CartLine, Gate, ShopApi, Shopper, StoreConfig, ShopProduct } from "@/lib/shop";
import type { StoreTheme } from "./theme";

export type Tab = "home" | "shop" | "checkout" | "orders" | "account";

/** Everything the storefront screens share: who's signed in, the basket, and how to move around. */
export type StoreCtx = {
  slug: string;
  gate: Gate;
  theme: StoreTheme;
  api: ShopApi;
  shopper: Shopper;
  setShopper: (s: Shopper) => void;
  store: StoreConfig;
  cart: CartLine[];
  cartCount: number;
  cartTotal: number;
  addToCart: (p: ShopProduct, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  setCart: (c: CartLine[]) => void;
  clearCart: () => void;
  openCart: () => void;
  go: (tab: Tab, orderId?: string | null) => void;
  focusOrderId: string | null;
  signOut: () => void;
  toast: (msg: string) => void;
  money: (n: number) => string;
};

const Ctx = createContext<StoreCtx | null>(null);
// The look is available before anyone has signed in (the register screen is themed too).
const ThemeCtx = createContext<StoreTheme | null>(null);
export const ThemeProvider = ThemeCtx.Provider;
export function useTheme(): StoreTheme {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error("useTheme outside the storefront");
  return t;
}
export const StoreProvider = Ctx.Provider;
export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside the storefront");
  return c;
}
