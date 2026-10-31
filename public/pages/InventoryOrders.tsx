import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Copy, MessageCircle, Plus, Search, Send, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select, TextArea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Pager } from "@/components/ui/Pager";
import { requestUpgrade } from "@/components/plan/PlanUi";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtMoney, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Suggestion = { id: string; name: string; category: string; unit: string; stock: number; reorderLevel: number; status: "ok" | "low" | "out"; perDay: number; suggested: number; supplierId: string | null; supplierName: string; unitCost?: number };
type PoLine = { productId: string; name: string; unit: string; qty: number; unitCost: number; receivedQty: number; lineTotal: number };
type Po = {
  id: string; poNo: string; status: "draft" | "sent" | "partial" | "received" | "cancelled" | "closed"; supplierId: string | null; supplierName: string;
  lines: PoLine[]; total: number; expectedDate: string | null; notes: string; createdBy: string; createdAt: string; sentAt: string | null;
  receipts: { at: string; by: string; lines: { name: string; qty: number; unitCost: number }[] }[]; outstandingUnits: number;
};

const PO_STATUS: Record<Po["status"], { label: string; tone: "neutral" | "brand" | "warning" | "success" | "danger" }> = {
  draft: { label: "Draft", tone: "neutral" }, sent: { label: "Sent", tone: "brand" }, partial: { label: "Part delivered", tone: "warning" },
  received: { label: "Received", tone: "success" }, cancelled: { label: "Cancelled", tone: "danger" }, closed: { label: "Closed", tone: "neutral" },
};

const num = (v: string) => (v === "" ? 0 : Number(v));

// ── Reorder ─────────────────────────────────────────────────────────────────

export function ReorderTab({ canCost, currency, goOrders }: { canCost: boolean; currency: string; goOrders: () => void }) {
  const { hasFeature } = useSession();
  const { data, loading, error } = useApi<{ items: Suggestion[]; suppliers: { supplierId: string | null; supplierName: string; count: number }[] }>("/inventory/reorder", []);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const money = (n: number) => fmtMoney(n, currency);

  useEffect(() => { if (data) setPicked(Object.fromEntries(data.items.map((i) => [i.id, true]))); }, [data]);

  const chosen = useMemo(() => (data?.items || []).filter((i) => picked[i.id]), [data, picked]);
  const lineQty = (i: Suggestion) => (qty[i.id] !== undefined ? num(qty[i.id]) : i.suggested);
  const lineCost = (i: Suggestion) => (cost[i.id] !== undefined ? num(cost[i.id]) : i.unitCost ?? 0);
  const estimate = chosen.reduce((t, i) => t + lineQty(i) * lineCost(i), 0);

  async function create() {
    if (!hasFeature("suppliers")) return requestUpgrade("suppliers");
    setBusy(true); setErr("");
    try {
      // One order per supplier: that's how goods are actually bought.
      const groups = new Map<string, Suggestion[]>();
      for (const i of chosen) { const k = i.supplierId || "none"; groups.set(k, [...(groups.get(k) || []), i]); }
      for (const [, items] of groups) {
        await api("/purchase-orders", { method: "POST", body: JSON.stringify({ supplierId: items[0].supplierId || undefined, lines: items.map((i) => ({ productId: i.id, qty: lineQty(i), unitCost: lineCost(i) })) }) });
      }
      goOrders();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (loading && !data) return <div className="py-16"><Spinner /></div>;
  if (!data) return <ErrorBanner message={error || "Couldn't load suggestions."} />;
  if (!data.items.length) return <Card><EmptyState icon={Check} title="Nothing needs reordering" body="Everything is above its reorder level and isn't selling out within a week." /></Card>;

  return (
    <div className="space-y-4">
      <ErrorBanner message={err} />
      <div className="text-[13px] text-t3">{data.items.length} item{data.items.length === 1 ? "" : "s"} at or below their reorder level, or selling out within a week. Quantities cover two reorder levels, or two weeks of selling, whichever is more.</div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead><tr className="bg-surface-2 border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.08em] text-t4">
              <th className="px-4 py-2.5 w-10" /><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5 text-right">In stock</th><th className="px-3 py-2.5 text-right">Selling</th><th className="px-3 py-2.5">Last supplier</th><th className="px-3 py-2.5 text-right">Order</th>{canCost && <th className="px-3 py-2.5 text-right">Unit cost</th>}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {data.items.map((i) => (
                <tr key={i.id} className={cn(!picked[i.id] && "opacity-50")}>
                  <td className="px-4 py-2"><input type="checkbox" aria-label={`Include ${i.name}`} checked={!!picked[i.id]} onChange={(e) => setPicked({ ...picked, [i.id]: e.target.checked })} className="accent-[var(--st-primary)]" /></td>
                  <td className="px-3 py-2"><div className="font-semibold text-t1">{i.name}</div><Badge tone={i.status === "out" ? "danger" : i.status === "low" ? "warning" : "neutral"}>{i.status === "out" ? "Out" : i.status === "low" ? "Low" : "Selling fast"}</Badge></td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{i.stock} <span className="text-t4 text-[11px]">/ {i.reorderLevel}</span></td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-t3">{i.perDay ? `${i.perDay}/day` : "—"}</td>
                  <td className="px-3 py-2 text-t3">{i.supplierName || "—"}</td>
                  <td className="px-3 py-2 text-right"><Input type="number" min={1} aria-label={`Quantity of ${i.name}`} value={qty[i.id] ?? String(i.suggested)} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} className="!w-20 !h-8 text-right ml-auto" /></td>
                  {canCost && <td className="px-3 py-2 text-right"><Input type="number" min={0} aria-label={`Unit cost of ${i.name}`} value={cost[i.id] ?? String(i.unitCost ?? 0)} onChange={(e) => setCost({ ...cost, [i.id]: e.target.value })} className="!w-24 !h-8 text-right ml-auto" /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {canCost ? (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="text-[13px] text-t2 mr-auto"><b className="text-t1">{chosen.length}</b> selected · about <b className="text-t1 font-mono">{money(estimate)}</b>{new Set(chosen.map((c) => c.supplierId || "none")).size > 1 && <span className="text-t3"> · one order per supplier</span>}</div>
          <Button onClick={create} disabled={busy || !chosen.length}><ClipboardList className="w-4 h-4" /> {busy ? "Creating…" : "Create purchase order" + (new Set(chosen.map((c) => c.supplierId || "none")).size > 1 ? "s" : "")}</Button>
        </div>
      ) : <p className="text-[12px] text-t4">Purchase orders show prices, so they're for roles that can see costs.</p>}
    </div>
  );
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export function OrdersTab({ currency, onChanged }: { currency: string; onChanged: () => void }) {
  const { hasFeature } = useSession();
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, loading, reload } = useApi<{ orders: Po[]; page: number; pages: number; total: number }>(hasFeature("suppliers") ? `/purchase-orders?status=${status}&page=${page}&limit=15` : null, [status, page]);
  const money = (n: number) => fmtMoney(n, currency);

  if (!hasFeature("suppliers")) {
    return (
      <Card className="p-8 text-center">
        <span className="mx-auto grid place-items-center w-12 h-12 rounded-2xl bg-primary-soft text-primary"><ClipboardList className="w-6 h-6" /></span>
        <div className="mt-3 text-[15px] font-semibold text-t1">Purchase orders are part of Pro</div>
        <p className="mt-1 text-[13px] text-t3 max-w-md mx-auto">Order from suppliers, share the order by WhatsApp, and book goods in as they arrive, with the price and supplier recorded.</p>
        <Button className="mt-4" onClick={() => requestUpgrade("suppliers")}>See what Pro includes</Button>
      </Card>
    );
  }

  const done = () => { reload(); onChanged(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-44" aria-label="Show">
          <option value="open">Open orders</option><option value="all">All orders</option><option value="draft">Drafts</option><option value="sent">Sent</option><option value="partial">Part delivered</option><option value="received">Received</option><option value="cancelled">Cancelled</option>
        </Select>
        <Button className="ml-auto" onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> New order</Button>
      </div>

      {loading && !data ? <div className="py-16"><Spinner /></div> : !data || !data.orders.length ? (
        <Card><EmptyState icon={ClipboardList} title="No purchase orders" body="Create one from the Reorder tab, or start a new order here." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {data.orders.map((o) => (
              <button key={o.id} onClick={() => setOpenId(o.id)} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-surface-2 transition-colors">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary-soft text-primary shrink-0"><Truck className="w-[18px] h-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[12.5px] font-semibold text-primary">{o.poNo}</span><Badge tone={PO_STATUS[o.status].tone}>{PO_STATUS[o.status].label}</Badge></div>
                  <div className="text-[13px] font-semibold text-t1 truncate mt-0.5">{o.supplierName || "No supplier"} · {o.lines.length} item{o.lines.length === 1 ? "" : "s"}</div>
                  <div className="text-[11.5px] text-t3">{fmtDate(o.createdAt)}{o.expectedDate ? ` · expected ${fmtDate(o.expectedDate)}` : ""}{o.status === "partial" ? ` · ${o.outstandingUnits} units still to come` : ""}</div>
                </div>
                <div className="font-mono font-semibold text-[14px] tabular-nums shrink-0">{money(o.total)}</div>
              </button>
            ))}
          </div>
          <Pager page={data.page} pages={data.pages} total={data.total} from={(data.page - 1) * 15 + 1} to={(data.page - 1) * 15 + data.orders.length} onPage={setPage} noun="orders" />
        </Card>
      )}

      <NewOrderModal open={creating} onClose={() => setCreating(false)} currency={currency} onDone={(id) => { setCreating(false); done(); setOpenId(id); }} />
      <OrderModal id={openId} currency={currency} onClose={() => setOpenId(null)} onChanged={done} />
    </div>
  );
}

function OrderModal({ id, currency, onClose, onChanged }: { id: string | null; currency: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading, reload } = useApi<{ order: Po }>(id ? `/purchase-orders/${id}` : null, [id]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Record<string, { qty: string; cost: string }>>({});
  const [recv, setRecv] = useState<Record<string, { qty: string; cost: string }>>({});
  const [share, setShare] = useState<{ text: string; wa: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const money = (n: number) => fmtMoney(n, currency);
  const po = data?.order;

  useEffect(() => { setError(""); setShare(null); setEdit({}); setRecv({}); }, [id]);
  useEffect(() => {
    if (!po) return;
    setEdit(Object.fromEntries(po.lines.map((l) => [l.productId, { qty: String(l.qty), cost: String(l.unitCost) }])));
    setRecv(Object.fromEntries(po.lines.map((l) => [l.productId, { qty: String(Math.max(0, l.qty - l.receivedQty)), cost: String(l.unitCost) }])));
  }, [po]);
  if (!id) return null;

  async function act(key: string, path: string, method: "POST" | "PUT", body?: unknown) {
    setBusy(key); setError("");
    try { const r = await api<any>(`/purchase-orders/${id}${path}`, { method, body: JSON.stringify(body || {}) }); onChanged(); await reload(); return r; }
    catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }

  const save = () => act("save", "", "PUT", { supplierId: po!.supplierId || undefined, supplierName: po!.supplierName || undefined, notes: po!.notes, lines: po!.lines.filter((l) => num(edit[l.productId]?.qty) > 0).map((l) => ({ productId: l.productId, qty: num(edit[l.productId].qty), unitCost: num(edit[l.productId].cost) })) });
  const send = async () => { const r = await act("send", "/send", "POST"); if (r) setShare({ text: r.shareText, wa: r.whatsappUrl }); };
  const receive = () => act("recv", "/receive", "POST", { updateCost: true, lines: po!.lines.map((l) => ({ productId: l.productId, qty: num(recv[l.productId]?.qty), unitCost: num(recv[l.productId]?.cost) })).filter((l) => l.qty > 0) });
  const draft = po?.status === "draft";
  const canReceive = po && ["sent", "partial"].includes(po.status);

  return (
    <Modal open onClose={onClose} title={po ? po.poNo : "Purchase order"} subtitle={po ? `${po.supplierName || "No supplier"} · ${fmtDate(po.createdAt)} · by ${po.createdBy}` : ""} wide>
      {loading || !po ? <div className="py-12"><Spinner /></div> : (
        <div className="space-y-4">
          <ErrorBanner message={error} />
          <div className="flex items-center gap-2 flex-wrap"><Badge tone={PO_STATUS[po.status].tone}>{PO_STATUS[po.status].label}</Badge>{po.expectedDate && <span className="text-[12px] text-t3">Expected {fmtDate(po.expectedDate)}</span>}{po.notes && <span className="text-[12px] text-t3 italic">“{po.notes}”</span>}</div>

          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-t4"><th className="px-3.5 py-2">Item</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Unit cost</th>{!draft && <th className="px-3 py-2 text-right">Received</th>}{canReceive && <th className="px-3 py-2 text-right">Receive now</th>}<th className="px-3.5 py-2 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-line">
                {po.lines.map((l) => (
                  <tr key={l.productId}>
                    <td className="px-3.5 py-2 font-medium text-t1">{l.name}</td>
                    <td className="px-3 py-2 text-right">{draft ? <Input type="number" min={0} aria-label={`Quantity of ${l.name}`} value={edit[l.productId]?.qty ?? ""} onChange={(e) => setEdit({ ...edit, [l.productId]: { ...edit[l.productId], qty: e.target.value } })} className="!w-20 !h-8 text-right ml-auto" /> : <span className="font-mono tabular-nums">{l.qty}</span>}</td>
                    <td className="px-3 py-2 text-right">{draft ? <Input type="number" min={0} aria-label={`Unit cost of ${l.name}`} value={edit[l.productId]?.cost ?? ""} onChange={(e) => setEdit({ ...edit, [l.productId]: { ...edit[l.productId], cost: e.target.value } })} className="!w-24 !h-8 text-right ml-auto" /> : <span className="font-mono tabular-nums">{money(l.unitCost)}</span>}</td>
                    {!draft && <td className="px-3 py-2 text-right font-mono tabular-nums text-t3">{l.receivedQty}</td>}
                    {canReceive && <td className="px-3 py-2 text-right">{l.qty - l.receivedQty > 0 ? <Input type="number" min={0} max={l.qty - l.receivedQty} aria-label={`Receive ${l.name}`} value={recv[l.productId]?.qty ?? ""} onChange={(e) => setRecv({ ...recv, [l.productId]: { ...recv[l.productId], qty: e.target.value } })} className="!w-20 !h-8 text-right ml-auto" /> : <span className="text-success text-[12px] font-semibold">Done</span>}</td>}
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums font-semibold">{money(draft ? num(edit[l.productId]?.qty) * num(edit[l.productId]?.cost) : l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-surface-2"><td className="px-3.5 py-2 font-semibold text-t1" colSpan={draft ? 3 : canReceive ? 4 : 3}>Total</td><td className="px-3.5 py-2 text-right font-mono tabular-nums font-semibold" colSpan={draft ? 1 : 2}>{money(draft ? po.lines.reduce((t, l) => t + num(edit[l.productId]?.qty) * num(edit[l.productId]?.cost), 0) : po.total)}</td></tr></tfoot>
            </table>
          </div>

          {share && (
            <div className="rounded-xl border border-success/30 bg-success-soft p-3.5 space-y-2">
              <div className="text-[12.5px] font-semibold text-success">Order sent. Share it with the supplier:</div>
              <pre className="text-[12px] text-t1 whitespace-pre-wrap font-sans bg-surface rounded-lg p-3 border border-line">{share.text}</pre>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(share.text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}</Button>
                {share.wa && <a href={share.wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-line-2 text-[12.5px] font-bold text-t1 hover:border-primary"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</a>}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {draft && <><Button onClick={send} disabled={!!busy}><Send className="w-4 h-4" /> {busy === "send" ? "Sending…" : "Mark as sent"}</Button><Button variant="secondary" onClick={save} disabled={!!busy}>{busy === "save" ? "Saving…" : "Save changes"}</Button></>}
            {canReceive && <Button variant="success" onClick={receive} disabled={!!busy}><Truck className="w-4 h-4" /> {busy === "recv" ? "Booking in…" : "Receive goods"}</Button>}
            {["draft", "sent", "partial"].includes(po.status) && <Button variant="ghost" className="ml-auto text-danger" onClick={() => act("cancel", "/cancel", "POST")} disabled={!!busy}><Trash2 className="w-4 h-4" /> {po.receipts.length ? "Close order" : "Cancel order"}</Button>}
          </div>
          {canReceive && <p className="text-[11.5px] text-t4">Receiving adds to your stock, records the supplier and price in the stock history, and updates each product's cost.</p>}

          {po.receipts.length > 0 && (
            <div>
              <div className="text-[12px] font-semibold text-t1 mb-1.5">Deliveries</div>
              <ul className="space-y-1">{po.receipts.map((r, i) => <li key={i} className="text-[12.5px] text-t2"><span className="text-t4">{fmtDate(r.at)}</span> · {r.lines.map((l) => `${l.name} ×${l.qty}`).join(", ")} <span className="text-t4">— {r.by}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function NewOrderModal({ open, onClose, currency, onDone }: { open: boolean; onClose: () => void; currency: string; onDone: (id: string) => void }) {
  const { data: sup } = useApi<{ suppliers: { id: string; name: string }[] }>(open ? "/suppliers" : null, [open]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ productId: string; name: string; qty: string; cost: string }[]>([]);
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { data: found } = useApi<{ items: { id: string; name: string; cost?: number; stock: number }[] }>(open && q.trim().length >= 2 ? `/inventory/overview?q=${encodeURIComponent(q.trim())}&limit=6` : null, [q, open]);
  const money = (n: number) => fmtMoney(n, currency);
  useEffect(() => { if (!open) { setSupplierId(""); setSupplierName(""); setQ(""); setLines([]); setExpected(""); setNotes(""); setError(""); } }, [open]);

  const add = (p: { id: string; name: string; cost?: number }) => { if (!lines.some((l) => l.productId === p.id)) setLines([...lines, { productId: p.id, name: p.name, qty: "1", cost: String(p.cost ?? 0) }]); setQ(""); };
  const total = lines.reduce((t, l) => t + num(l.qty) * num(l.cost), 0);

  async function save() {
    setBusy(true); setError("");
    try {
      const r = await api<{ order: Po }>("/purchase-orders", { method: "POST", body: JSON.stringify({ supplierId: supplierId || undefined, supplierName: !supplierId && supplierName ? supplierName : undefined, expectedDate: expected || undefined, notes, lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), unitCost: num(l.cost) })) }) });
      onDone(r.order.id);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New purchase order" subtitle="Start a draft. Nothing is ordered until you mark it as sent." wide>
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">No supplier on record</option>
              {(sup?.suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          {!supplierId ? <Field label="Or type a name"><Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. the market vendor" /></Field> : <Field label="Needed by (optional)"><Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>}
        </div>

        <div>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your products to add them…" className="!pl-9" /></div>
          {found && found.items.length > 0 && (
            <ul className="mt-1.5 rounded-xl border border-line divide-y divide-line overflow-hidden">
              {found.items.map((p) => <li key={p.id}><button type="button" onClick={() => add(p)} className="w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] hover:bg-surface-2"><span className="font-medium text-t1">{p.name}</span><span className="text-t3 text-[12px]">{p.stock} in stock</span></button></li>)}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-surface-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-t4"><th className="px-3.5 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit cost</th><th className="px-3.5 py-2 text-right">Total</th><th /></tr></thead>
              <tbody className="divide-y divide-line">
                {lines.map((l, i) => (
                  <tr key={l.productId}>
                    <td className="px-3.5 py-2 font-medium text-t1">{l.name}</td>
                    <td className="px-3 py-2"><Input type="number" min={1} aria-label={`Quantity of ${l.name}`} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className="!w-20 !h-8 text-right ml-auto" /></td>
                    <td className="px-3 py-2"><Input type="number" min={0} aria-label={`Unit cost of ${l.name}`} value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} className="!w-24 !h-8 text-right ml-auto" /></td>
                    <td className="px-3.5 py-2 text-right font-mono tabular-nums">{money(num(l.qty) * num(l.cost))}</td>
                    <td className="px-2"><button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines(lines.filter((_, j) => j !== i))} className="p-1.5 text-t4 hover:text-danger"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-surface-2"><td className="px-3.5 py-2 font-semibold" colSpan={3}>Total</td><td className="px-3.5 py-2 text-right font-mono tabular-nums font-semibold" colSpan={2}>{money(total)}</td></tr></tfoot>
            </table>
          </div>
        )}
        <Field label="Note for the supplier (optional)"><TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. morning delivery please" /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy || !lines.length || lines.some((l) => num(l.qty) <= 0)}>{busy ? "Saving…" : "Save draft"}</Button></div>
      </div>
    </Modal>
  );
}
