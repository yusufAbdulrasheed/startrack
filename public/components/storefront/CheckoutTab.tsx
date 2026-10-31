import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CircleCheck, Clock, MapPin, ShoppingBag, Store, Truck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { newAttemptId, type PaymentMethod, type Quote } from "@/lib/shop";
import { Button, Card, Field, Notice, Spinner, Thumb, TextInput } from "./bits";
import { useStore } from "./context";

type Fulfil = "pickup" | "delivery";

/**
 * The totals shown here come from the SERVER (/quote), never from arithmetic in
 * the browser, and the order is placed with the total the customer agreed to —
 * if a price moved in between, the server says so instead of charging a
 * different amount.
 */
export function CheckoutTab() {
  const { api, theme: t, store, shopper, cart, setQty, setCart, clearCart, go, money, toast } = useStore();
  const [type, setType] = useState<Fulfil>(store.pickup ? "pickup" : "delivery");
  const [address, setAddress] = useState(shopper.address || "");
  const [phone, setPhone] = useState(shopper.phone || "");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [priceNote, setPriceNote] = useState("");

  const methods = useMemo(() => {
    const out: { key: PaymentMethod; label: string; hint: string; icon: typeof Banknote }[] = [];
    if (type === "delivery" && store.payments.cash_on_delivery) out.push({ key: "cash_on_delivery", label: "Pay on delivery", hint: "Pay the rider in cash or by transfer when it arrives", icon: Banknote });
    if (type === "pickup" && store.payments.pay_at_pickup) out.push({ key: "pay_at_pickup", label: "Pay at pickup", hint: "Pay when you collect your order", icon: Store });
    if (store.payments.transfer) out.push({ key: "transfer", label: "Bank transfer", hint: "Transfer now — the account details are on the next screen", icon: Building2 });
    return out;
  }, [type, store]);

  // Keep the chosen payment valid when the way of receiving it changes.
  useEffect(() => { if (!methods.some((m) => m.key === method)) setMethod(methods[0]?.key || ""); }, [methods, method]);

  // Price the basket on the server whenever it, or the delivery choice, changes.
  const basketKey = JSON.stringify(cart.map((l) => [l.id, l.qty]));
  useEffect(() => {
    if (!cart.length) { setQuote(null); return; }
    let live = true;
    setQuoting(true);
    const id = setTimeout(() => {
      api.quote(cart.map((l) => ({ productId: l.id, qty: l.qty })), type)
        .then((q) => live && setQuote(q))
        .catch((e) => live && setError(e.message))
        .finally(() => live && setQuoting(false));
    }, 200);
    return () => { live = false; clearTimeout(id); };
  }, [api, basketKey, type]); // eslint-disable-line react-hooks/exhaustive-deps

  // One id per distinct order: a retry of the SAME order can never place it twice,
  // and changing anything makes it a new order.
  const attemptId = useMemo(newAttemptId, [basketKey, type, method, address, note, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const problems = quote?.problems.filter((p) => p.kind !== "minimum") || [];
  const minimum = quote?.problems.find((p) => p.kind === "minimum");
  const addressOk = type === "pickup" || address.trim().length >= 8;
  const canPlace = !!quote && !problems.length && !minimum && addressOk && !!method && store.acceptingOrders && !busy && !quoting && phone.trim().length >= 7;

  function fixBasket() {
    // Trim every line to what's actually available, and drop what's gone.
    const next = cart.flatMap((l) => {
      const p = problems.find((x) => x.productId === l.id);
      if (!p) return [l];
      if (p.kind === "stock" && (p.available ?? 0) > 0) return [{ ...l, qty: p.available! }];
      return [];
    });
    setCart(next);
    toast("We've updated your basket to what's available.");
  }

  async function place() {
    if (!quote || !method) return;
    setBusy(true); setError(""); setPriceNote("");
    try {
      const { order } = await api.placeOrder({
        clientOrderId: attemptId,
        items: cart.map((l) => ({ productId: l.id, qty: l.qty })),
        fulfilment: { type, address: type === "delivery" ? address.trim() : undefined },
        payment: { method },
        contactPhone: phone.trim(),
        note: note.trim() || undefined,
        expectedTotal: quote.total,
      });
      clearCart();
      go("orders", order.id);
      toast(`Order ${order.orderNo} placed!`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "price_changed") {
        setPriceNote("Some prices changed while you were shopping. Please check the new total below and place your order again.");
        api.quote(cart.map((l) => ({ productId: l.id, qty: l.qty })), type).then(setQuote).catch(() => {});
      } else if (err.code === "basket_problem") {
        api.quote(cart.map((l) => ({ productId: l.id, qty: l.qty })), type).then(setQuote).catch(() => {});
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!cart.length) {
    return (
      <div className="max-w-[560px] mx-auto px-5 py-24 text-center">
        <span className="mx-auto grid place-items-center w-16 h-16 rounded-3xl" style={{ background: t.soft, color: t.accent }}><ShoppingBag className="w-7 h-7" /></span>
        <h1 className="mt-5 text-[24px] font-extrabold">Your basket is empty</h1>
        <p className="mt-2 text-[15px]" style={{ color: t.muted }}>Add something from the shop to get started.</p>
        <Button className="mt-6" onClick={() => go("shop")}>Browse the shop</Button>
      </div>
    );
  }

  const optionStyle = (on: boolean) => ({ background: on ? t.soft : t.surface, border: `1.5px solid ${on ? t.accent : t.line}` });

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-10 py-6 lg:py-10 pb-32">
      <h1 className="text-[28px] lg:text-[34px] font-extrabold tracking-[-0.025em]">Checkout</h1>
      {!store.acceptingOrders && <div className="mt-4"><Notice tone="info">This shop isn't taking new orders right now.</Notice></div>}

      <div className="mt-6 grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-8 items-start">
        <div className="space-y-5">
          <Card className="p-5 lg:p-6">
            <h2 className="text-[17px] font-extrabold">How would you like it?</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-3">
              {([
                ["pickup", store.pickup, Store, "Pickup", store.leadTime || "Collect from the shop"],
                ["delivery", store.delivery, Truck, "Delivery", store.deliveryFee ? `${money(store.deliveryFee)} delivery fee${store.freeDeliveryOver ? ` · free over ${money(store.freeDeliveryOver)}` : ""}` : "Brought to you"],
              ] as const).filter(([, on]) => on).map(([k, , Icon, label, hint]) => (
                <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k} className="text-left p-4 rounded-2xl flex items-start gap-3" style={optionStyle(type === k)}>
                  <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: type === k ? t.accent : t.soft, color: type === k ? t.onAccent : t.accent }}><Icon className="w-5 h-5" /></span>
                  <span><span className="block font-extrabold text-[15px]">{label}</span><span className="block text-[12.5px] mt-0.5" style={{ color: t.muted }}>{hint}</span></span>
                </button>
              ))}
            </div>

            {type === "delivery" && (
              <div className="mt-4">
                <Field label="Delivery address" hint={store.deliveryAreas ? `We deliver to: ${store.deliveryAreas}` : "Include the street, area and a landmark."} error={address && !addressOk ? "Enter the full address" : undefined}>
                  <textarea
                    value={address} onChange={(e) => setAddress(e.target.value)} rows={3} maxLength={250} placeholder="12 Admiralty Way, Lekki Phase 1, Lagos"
                    className="w-full px-4 py-3 rounded-2xl text-[15px] outline-none resize-none" style={{ background: t.surface, color: t.text, border: `1.5px solid ${t.line}` }}
                  />
                </Field>
              </div>
            )}
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <Field label="Phone for this order"><TextInput value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" /></Field>
              <Field label="Note to the shop (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. call when you arrive" /></Field>
            </div>
          </Card>

          <Card className="p-5 lg:p-6">
            <h2 className="text-[17px] font-extrabold">How will you pay?</h2>
            <div className="mt-4 grid gap-3">
              {methods.map((m) => (
                <button key={m.key} type="button" onClick={() => setMethod(m.key)} aria-pressed={method === m.key} className="text-left p-4 rounded-2xl flex items-center gap-3" style={optionStyle(method === m.key)}>
                  <span className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: method === m.key ? t.accent : t.soft, color: method === m.key ? t.onAccent : t.accent }}><m.icon className="w-5 h-5" /></span>
                  <span className="flex-1"><span className="block font-extrabold text-[15px]">{m.label}</span><span className="block text-[12.5px] mt-0.5" style={{ color: t.muted }}>{m.hint}</span></span>
                  {method === m.key && <CircleCheck className="w-5 h-5 shrink-0" style={{ color: t.accent }} />}
                </button>
              ))}
              {!methods.length && <Notice>This shop hasn't set up a way to pay for {type === "delivery" ? "delivery" : "pickup"} orders yet.</Notice>}
            </div>
          </Card>
        </div>

        {/* Summary */}
        <Card className="p-5 lg:p-6 lg:sticky lg:top-24">
          <h2 className="text-[17px] font-extrabold">Your order</h2>
          <ul className="mt-4 divide-y" style={{ borderColor: t.line }}>
            {cart.map((l) => {
              const p = problems.find((x) => x.productId === l.id);
              return (
                <li key={l.id} className="py-3 flex items-center gap-3" style={{ borderColor: t.line }}>
                  <Thumb name={l.name} url={l.imageUrl} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate">{l.name}</div>
                    <div className="text-[12.5px] tabular-nums" style={{ color: p ? t.danger : t.muted }}>{p ? p.message : `${l.qty} × ${money(l.price)}`}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button aria-label={`Remove one ${l.name}`} className="w-8 h-8 rounded-full font-bold" style={{ background: t.soft, color: t.accent }} onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                    <span className="w-6 text-center font-extrabold tabular-nums text-[14px]">{l.qty}</span>
                    <button aria-label={`Add one ${l.name}`} className="w-8 h-8 rounded-full font-bold" style={{ background: t.accent, color: t.onAccent }} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                  </div>
                </li>
              );
            })}
          </ul>

          {quoting && !quote ? <div className="py-6 grid place-items-center"><Spinner t={t} size={22} /></div> : quote && (
            <dl className="mt-3 space-y-2 text-[14px]">
              <Row k="Subtotal" v={money(quote.subtotal)} />
              {quote.vat > 0 && <Row k={`VAT (${store.vat}%)`} v={money(quote.vat)} />}
              {type === "delivery" && <Row k="Delivery" v={quote.deliveryFee ? money(quote.deliveryFee) : "Free"} />}
              <div className="pt-3 mt-1 flex items-center justify-between text-[18px] font-extrabold" style={{ borderTop: `1px solid ${t.line}` }}>
                <dt>Total</dt><dd className="tabular-nums" style={{ color: t.accent, opacity: quoting ? 0.5 : 1 }}>{money(quote.total)}</dd>
              </div>
            </dl>
          )}

          <div className="mt-4 space-y-3">
            {priceNote && <Notice tone="info">{priceNote}</Notice>}
            {problems.length > 0 && (
              <Notice>
                {problems[0].message}{problems.length > 1 ? ` (+${problems.length - 1} more)` : ""}
                <button type="button" onClick={fixBasket} className="block mt-2 underline font-extrabold">Update my basket</button>
              </Notice>
            )}
            {minimum && <Notice tone="info">{minimum.message}</Notice>}
            {error && <Notice>{error}</Notice>}
          </div>

          <Button full className="mt-5" disabled={!canPlace} onClick={place}>
            {busy ? "Placing your order…" : `Place order${quote ? ` · ${money(quote.total)}` : ""}`}
          </Button>
          <p className="mt-3 text-[12px] leading-relaxed flex items-start gap-1.5" style={{ color: t.muted }}>
            <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" /> The shop confirms your order before it's final. You won't be charged online.
          </p>
          {type === "delivery" && <p className="mt-1.5 text-[12px] flex items-center gap-1.5" style={{ color: t.muted }}><MapPin className="w-3.5 h-3.5" /> Delivering to {address.trim() ? "the address above" : "…"}</p>}
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex items-center justify-between"><dt className="opacity-70">{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>;
}
