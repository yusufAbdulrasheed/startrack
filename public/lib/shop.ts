import { ApiError } from "@/lib/api";

/**
 * The customer's side of a business's online store: types, the API client and
 * the basket. A shopper's session is per store (a token from one shop means
 * nothing at another), so everything is keyed by the store's address.
 */

export type Gate = {
  storefront: true;
  name: string; logoUrl: string; heroUrl: string; accent: string; mode: "light" | "dark";
  template: "classic" | "bold" | "minimal"; headline: string; tagline: string; announcement: string; acceptingOrders: boolean;
};

export type Shopper = { id: string; name: string; email: string; phone: string; address: string };

export type StoreConfig = {
  acceptingOrders: boolean; currency: string; pickup: boolean; delivery: boolean;
  deliveryFee: number; freeDeliveryOver: number; minOrder: number; vat: number;
  payments: { cash_on_delivery: boolean; pay_at_pickup: boolean; transfer: boolean };
  bank: { bankName: string; accountName: string; accountNumber: string } | null;
  leadTime: string; instructions: string; deliveryAreas: string;
  contact: { phone: string; whatsapp: string };
};

export type ShopProduct = { id: string; name: string; category: string; price: number; imageUrl: string; unit: string; available: boolean; left: number | null };
export type Catalog = { products: ShopProduct[]; categories: string[]; total: number; page: number; pages: number };

export type PaymentMethod = "cash_on_delivery" | "pay_at_pickup" | "transfer";
export type OrderStatus = "placed" | "confirmed" | "ready" | "out_for_delivery" | "completed" | "cancelled" | "rejected";

export type ShopOrder = {
  id: string; orderNo: string; status: OrderStatus; placedAt: string;
  items: { productId: string; name: string; qty: number; unitPrice: number; lineNet: number; imageUrl: string }[];
  subtotal: number; vat: number; deliveryFee: number; total: number;
  fulfilment: { type: "pickup" | "delivery"; address: string };
  note: string;
  payment: { method: PaymentMethod; label: string; status: "unpaid" | "paid"; paidAt: string | null };
  history: { status: string; at: string; note: string }[];
  reason: string;
  bank?: { bankName: string; accountName: string; accountNumber: string };
};

export type Quote = {
  lines: { productId: string; name: string; qty: number; unitPrice: number; lineNet: number; imageUrl: string }[];
  subtotal: number; vat: number; deliveryFee: number; total: number;
  problems: { kind: string; productId?: string; name?: string; available?: number; requested?: number; message: string }[];
};

export type CartLine = { id: string; name: string; price: number; imageUrl: string; qty: number };

const tokenKey = (slug: string) => `startrack.shopper.${slug}`;
const cartKey = (slug: string) => `startrack.cart.${slug}`;

export const getShopToken = (slug: string) => { try { return localStorage.getItem(tokenKey(slug)); } catch { return null; } };
export const setShopToken = (slug: string, t: string | null) => { try { if (t) localStorage.setItem(tokenKey(slug), t); else localStorage.removeItem(tokenKey(slug)); } catch { /* private mode: session just won't persist */ } };

export function loadCart(slug: string): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cartKey(slug)) || "[]");
    return Array.isArray(raw) ? raw.filter((l) => l && typeof l.id === "string" && l.qty > 0).slice(0, 40) : [];
  } catch { return []; }
}
export const saveCart = (slug: string, cart: CartLine[]) => { try { localStorage.setItem(cartKey(slug), JSON.stringify(cart)); } catch { /* ignore */ } };

/** A fresh id for one checkout attempt, so a retry can never place the order twice. */
export const newAttemptId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

export type ShopApi = ReturnType<typeof createShopApi>;

export function createShopApi(slug: string, onUnauthorized: () => void) {
  const base = `/api/public/store/${encodeURIComponent(slug)}`;

  async function call<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
    const token = getShopToken(slug);
    let res: Response;
    try {
      res = await fetch(base + path, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch {
      throw new ApiError("Can't reach the shop. Check your connection and try again.", 0, "network");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // A dead session (expired, password changed) sends them back to the sign-in screen.
      if (res.status === 401 && token && !path.startsWith("/auth/login")) onUnauthorized();
      throw new ApiError(data.message || data.error || "Something went wrong", res.status, data.error, data);
    }
    return data as T;
  }

  return {
    register: (b: { name: string; email: string; phone: string; password: string }) => call<{ token: string; shopper: Shopper }>("/auth/register", { method: "POST", body: b }),
    login: (b: { email: string; password: string }) => call<{ token: string; shopper: Shopper }>("/auth/login", { method: "POST", body: b }),
    forgot: (email: string) => call<{ ok: true; message: string; devCode?: string }>("/auth/forgot", { method: "POST", body: { email } }),
    reset: (b: { email: string; code: string; password: string }) => call<{ token: string; shopper: Shopper }>("/auth/reset", { method: "POST", body: b }),
    me: () => call<{ shopper: Shopper }>("/auth/me"),
    updateMe: (b: Partial<Pick<Shopper, "name" | "phone" | "address">>) => call<{ shopper: Shopper }>("/auth/me", { method: "PATCH", body: b }),
    changePassword: (b: { currentPassword: string; newPassword: string }) => call<{ ok: true }>("/auth/password", { method: "POST", body: b }),
    site: () => call<{ site: any; store: StoreConfig; shopper: Shopper }>("/site"),
    catalog: (p: { q?: string; category?: string; page?: number }) => {
      const qs = new URLSearchParams();
      if (p.q) qs.set("q", p.q);
      if (p.category) qs.set("category", p.category);
      if (p.page) qs.set("page", String(p.page));
      return call<Catalog>(`/catalog?${qs}`);
    },
    quote: (items: { productId: string; qty: number }[], fulfilmentType: "pickup" | "delivery") => call<Quote>("/quote", { method: "POST", body: { items, fulfilmentType } }),
    placeOrder: (b: unknown) => call<{ order: ShopOrder }>("/orders", { method: "POST", body: b }),
    orders: (page = 1) => call<{ orders: ShopOrder[]; page: number; pages: number; total: number }>(`/orders?page=${page}`),
    order: (id: string) => call<{ order: ShopOrder }>(`/orders/${id}`),
    cancel: (id: string) => call<{ order: ShopOrder }>(`/orders/${id}/cancel`, { method: "POST" }),
  };
}
