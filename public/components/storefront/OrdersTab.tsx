import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, MessageCircle, PackageSearch, RotateCcw } from "lucide-react";
import { ApiError } from "@/lib/api";
import type { OrderStatus, ShopOrder } from "@/lib/shop";
import { toIntlPhone } from "@/lib/phone";
import { STATUS_LABEL } from "./theme";
import { Button, Card, Notice, Pill, Spinner, Thumb } from "./bits";
import { useStore } from "./context";

const when = (d: string) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function useStatusColor() {
  const { theme: t } = useStore();
  return (s: OrderStatus) => (s === "completed" ? t.success : s === "cancelled" || s === "rejected" ? t.danger : s === "placed" ? "#b7791f" : t.accent);
}

export function OrdersTab() {
  const { api, theme: t, focusOrderId, go } = useStore();
  const [orders, setOrders] = useState<ShopOrder[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => api.orders().then((r) => setOrders(r.orders)).catch((e) => setError(e.message)), [api]);
  useEffect(() => { load(); }, [load]);

  if (focusOrderId) return <OrderDetail id={focusOrderId} onBack={() => { go("orders", null); load(); }} />;

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-10 py-6 lg:py-10 pb-28">
      <h1 className="text-[28px] lg:text-[34px] font-extrabold tracking-[-0.025em]">My orders</h1>
      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      {!orders ? (
        <div className="py-24 grid place-items-center"><Spinner t={t} /></div>
      ) : !orders.length ? (
        <div className="py-20 text-center">
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-3xl" style={{ background: t.soft, color: t.accent }}><PackageSearch className="w-7 h-7" /></span>
          <h2 className="mt-4 text-[19px] font-extrabold">No orders yet</h2>
          <p className="mt-1.5 text-[14.5px]" style={{ color: t.muted }}>When you order, you can follow it here.</p>
          <Button className="mt-6" onClick={() => go("shop")}>Start shopping</Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">{orders.map((o) => <OrderRow key={o.id} o={o} />)}</ul>
      )}
    </div>
  );
}

function OrderRow({ o }: { o: ShopOrder }) {
  const { theme: t, go, money } = useStore();
  const color = useStatusColor()(o.status);
  return (
    <li>
      <button onClick={() => go("orders", o.id)} className="w-full text-left p-4 lg:p-5 rounded-3xl flex items-center gap-4 transition-transform active:scale-[0.99]" style={{ background: t.surface, border: `1px solid ${t.line}` }}>
        <div className="flex -space-x-3">{o.items.slice(0, 3).map((i) => <span key={i.productId} className="rounded-2xl ring-2" style={{ ["--tw-ring-color" as string]: t.surface }}><Thumb name={i.name} url={i.imageUrl} size={44} /></span>)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-extrabold text-[15px]">{o.orderNo}</span><Pill color={color}>{STATUS_LABEL[o.status]}</Pill></div>
          <div className="text-[13px] mt-1 truncate" style={{ color: t.muted }}>{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</div>
          <div className="text-[12px] mt-0.5" style={{ color: t.muted }}>{when(o.placedAt)}</div>
        </div>
        <div className="text-right shrink-0"><div className="font-extrabold tabular-nums">{money(o.total)}</div><ChevronRight className="w-4 h-4 ml-auto mt-1" style={{ color: t.muted }} /></div>
      </button>
    </li>
  );
}

function steps(o: ShopOrder): { key: string; label: string }[] {
  return o.fulfilment.type === "delivery"
    ? [{ key: "placed", label: "Order placed" }, { key: "confirmed", label: "Confirmed" }, { key: "out_for_delivery", label: "On its way" }, { key: "completed", label: "Delivered" }]
    : [{ key: "placed", label: "Order placed" }, { key: "confirmed", label: "Confirmed" }, { key: "ready", label: "Ready for pickup" }, { key: "completed", label: "Collected" }];
}

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { api, theme: t, store, cart, setCart, go, money, toast } = useStore();
  const [o, setO] = useState<ShopOrder | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const color = useStatusColor();

  const load = useCallback(() => api.order(id).then((r) => setO(r.order)).catch((e) => setError(e.message)), [api, id]);
  useEffect(() => { load(); }, [load]);
  // Keep a live order fresh without the customer having to refresh the page.
  useEffect(() => {
    if (!o || ["completed", "cancelled", "rejected"].includes(o.status)) return;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [o, load]);

  async function cancel() {
    setBusy(true); setError("");
    try { setO((await api.cancel(id)).order); toast("Order cancelled."); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  }

  function reorder() {
    if (!o) return;
    const merged = [...cart];
    for (const i of o.items) {
      const ex = merged.find((l) => l.id === i.productId);
      if (ex) ex.qty = Math.min(99, ex.qty + i.qty);
      else merged.push({ id: i.productId, name: i.name, price: i.unitPrice, imageUrl: i.imageUrl, qty: i.qty });
    }
    setCart(merged);
    toast("Added to your basket — check the latest prices at checkout.");
    go("checkout");
  }

  if (!o) return <div className="py-32 grid place-items-center">{error ? <Notice>{error}</Notice> : <Spinner t={t} />}</div>;

  const list = steps(o);
  const dead = o.status === "cancelled" || o.status === "rejected";
  const reached = Math.max(0, list.findIndex((s) => s.key === o.status));
  const wa = toIntlPhone(store.contact.whatsapp || store.contact.phone);

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-10 py-6 lg:py-10 pb-28">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold mb-4" style={{ color: t.muted }}><ArrowLeft className="w-4 h-4" /> All orders</button>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-[28px] font-extrabold tracking-[-0.025em]">{o.orderNo}</h1>
        <Pill color={color(o.status)}>{STATUS_LABEL[o.status]}</Pill>
      </div>
      <p className="text-[13.5px] mt-1" style={{ color: t.muted }}>Placed {when(o.placedAt)}</p>

      {error && <div className="mt-4"><Notice>{error}</Notice></div>}
      {o.status === "placed" && <div className="mt-4"><Notice tone="info">Thanks! The shop will confirm your order shortly{store.leadTime ? ` — ${store.leadTime.toLowerCase()}` : ""}.</Notice></div>}
      {dead && o.reason && <div className="mt-4"><Notice>{o.status === "rejected" ? "The shop couldn't take this order: " : ""}{o.reason}</Notice></div>}

      {o.bank && (
        <Card className="mt-4 p-5" style={{ border: `1.5px solid ${t.accent}` }}>
          <h2 className="font-extrabold text-[16px]">Pay by bank transfer</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14.5px]">
            <dt style={{ color: t.muted }}>Bank</dt><dd className="font-bold">{o.bank.bankName}</dd>
            <dt style={{ color: t.muted }}>Account name</dt><dd className="font-bold">{o.bank.accountName}</dd>
            <dt style={{ color: t.muted }}>Account number</dt><dd className="font-extrabold tracking-wider tabular-nums">{o.bank.accountNumber}</dd>
            <dt style={{ color: t.muted }}>Amount</dt><dd className="font-extrabold" style={{ color: t.accent }}>{money(o.total)}</dd>
            <dt style={{ color: t.muted }}>Reference</dt><dd className="font-bold">{o.orderNo}</dd>
          </dl>
        </Card>
      )}

      {!dead && (
        <Card className="mt-5 p-5 lg:p-6">
          <ol className="grid grid-cols-4 gap-1">
            {list.map((s, i) => {
              const done = i <= reached;
              return (
                <li key={s.key} className="text-center">
                  <div className="relative">
                    {i > 0 && <span className="absolute right-1/2 top-4 w-full h-[3px] -translate-y-1/2" style={{ background: done ? t.accent : t.line }} />}
                    <span className="relative z-10 mx-auto grid place-items-center w-8 h-8 rounded-full" style={{ background: done ? t.accent : t.surface, color: t.onAccent, border: `2px solid ${done ? t.accent : t.line}` }}>{done && <Check className="w-4 h-4" strokeWidth={3} />}</span>
                  </div>
                  <div className="mt-2 text-[11.5px] lg:text-[12.5px] font-bold leading-tight" style={{ color: done ? t.text : t.muted }}>{s.label}</div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <Card className="mt-5 p-5 lg:p-6">
        <h2 className="font-extrabold text-[16px]">Items</h2>
        <ul className="mt-3 divide-y" style={{ borderColor: t.line }}>
          {o.items.map((i) => (
            <li key={i.productId} className="py-3 flex items-center gap-3" style={{ borderColor: t.line }}>
              <Thumb name={i.name} url={i.imageUrl} size={48} />
              <div className="flex-1 min-w-0"><div className="font-bold text-[14.5px] truncate">{i.name}</div><div className="text-[12.5px] tabular-nums" style={{ color: t.muted }}>{i.qty} × {money(i.unitPrice)}</div></div>
              <div className="font-bold tabular-nums">{money(i.lineNet)}</div>
            </li>
          ))}
        </ul>
        <dl className="mt-3 pt-3 space-y-1.5 text-[14px]" style={{ borderTop: `1px solid ${t.line}` }}>
          <div className="flex justify-between"><dt style={{ color: t.muted }}>Subtotal</dt><dd className="tabular-nums">{money(o.subtotal)}</dd></div>
          {o.vat > 0 && <div className="flex justify-between"><dt style={{ color: t.muted }}>VAT</dt><dd className="tabular-nums">{money(o.vat)}</dd></div>}
          {o.fulfilment.type === "delivery" && <div className="flex justify-between"><dt style={{ color: t.muted }}>Delivery</dt><dd className="tabular-nums">{o.deliveryFee ? money(o.deliveryFee) : "Free"}</dd></div>}
          <div className="flex justify-between text-[17px] font-extrabold pt-1.5"><dt>Total</dt><dd className="tabular-nums">{money(o.total)}</dd></div>
        </dl>
      </Card>

      <Card className="mt-5 p-5 lg:p-6 text-[14.5px] space-y-2">
        <div className="flex justify-between gap-4"><span style={{ color: t.muted }}>{o.fulfilment.type === "delivery" ? "Delivery to" : "Pickup"}</span><span className="font-bold text-right">{o.fulfilment.type === "delivery" ? o.fulfilment.address : "At the shop"}</span></div>
        <div className="flex justify-between gap-4"><span style={{ color: t.muted }}>Payment</span><span className="font-bold text-right">{o.payment.label} · {o.payment.status === "paid" ? "Paid" : "Not paid yet"}</span></div>
        {o.note && <div className="flex justify-between gap-4"><span style={{ color: t.muted }}>Your note</span><span className="font-bold text-right">{o.note}</span></div>}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button kind="soft" onClick={reorder}><RotateCcw className="w-4 h-4" /> Order again</Button>
        {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, about my order ${o.orderNo}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full text-[14.5px] font-bold" style={{ boxShadow: `inset 0 0 0 1.5px ${t.line}` }}><MessageCircle className="w-4 h-4" /> Message the shop</a>}
        {o.status === "placed" && <Button kind="danger" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel order"}</Button>}
      </div>
    </div>
  );
}
