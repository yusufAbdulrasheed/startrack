import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bike, Check, Copy, Eye, Loader2, Printer, QrCode, ScanLine, Store, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { qrDataUrl } from "@/lib/qrcode";
import { useApi } from "@/lib/useApi";
import { cn } from "@/lib/utils";

type Store = {
  enabled: boolean; acceptingOrders: boolean; branchId: string | null;
  pickup: boolean; delivery: boolean; deliveryFee: number; freeDeliveryOver: number; minOrder: number;
  payOnDelivery: boolean; payAtPickup: boolean; transfer: boolean;
  bankName: string; accountName: string; accountNumber: string; leadTime: string; instructions: string; deliveryAreas: string;
};
type Payload = { store: Store; eligible: boolean; pageLive: boolean; slug: string; visits: number; qrScans: number; branches: { id: string; name: string }[]; currency: string };

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative w-11 h-6 rounded-full transition-colors shrink-0", on ? "bg-primary" : "bg-line-2")}>
      <span className={cn("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
    </button>
  );
}

function Row({ title, hint, on, onChange, children }: { title: string; hint: string; on: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div><div className="text-[13.5px] font-bold text-t1">{title}</div><div className="text-[12px] text-t3">{hint}</div></div>
        <Switch on={on} onChange={onChange} label={title} />
      </div>
      {on && children && <div className="mt-3 pt-3 border-t border-line">{children}</div>}
    </div>
  );
}

const num = (v: string) => Math.max(0, Number(v.replace(/[^\d.]/g, "")) || 0);

export function StoreSettings() {
  const { data, loading, reload } = useApi<Payload>("/site/storefront", []);
  const [draft, setDraft] = useState<Store | null>(null);
  const [saved, setSaved] = useState<Store | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => { if (data) { setDraft(data.store); setSaved(data.store); } }, [data]);

  const link = data?.slug ? `${window.location.origin}/s/${data.slug}` : "";
  // ?src=qr is how a scan of the printed code is told apart from a shared link.
  useEffect(() => { if (link) qrDataUrl(`${link}?src=qr`, 640).then(setQr).catch(() => setQr("")); }, [link]);

  if (loading && !data) return <div className="py-16"><Spinner /></div>;
  if (!data || !draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Store>(k: K, v: Store[K]) => { setDraft({ ...draft, [k]: v }); setJustSaved(false); };

  async function save() {
    setSaving(true); setError("");
    try {
      await api("/site/storefront", { method: "PUT", body: JSON.stringify(draft) });
      setSaved(draft); setJustSaved(true); reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function printPoster() {
    const w = window.open("", "_blank", "width=800,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><title>Scan to shop</title><style>
      body{font-family:system-ui,sans-serif;text-align:center;padding:60px 40px;color:#111}
      h1{font-size:44px;margin:0 0 6px}p{font-size:20px;color:#555;margin:0 0 30px}
      img{width:440px;height:440px}.url{font-size:18px;margin-top:22px;word-break:break-all}
    </style><h1>Scan to shop with us</h1><p>Open your phone's camera and point it at the code.</p>
    <img src="${qr}" alt="QR code"><div class="url">${link.replace(/^https?:\/\//, "")}</div>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>`);
    w.document.close();
  }

  const bankMissing = draft.transfer && (!draft.bankName || !draft.accountName || !draft.accountNumber);

  return (
    <div className="space-y-5 max-w-[860px]">
      <ErrorBanner message={error} />
      {!data.eligible && (
        <div className="rounded-xl bg-warning-soft text-warning px-4 py-3 text-[13px] font-semibold">This kind of business sells rooms, classes or appointments rather than items from a basket, so it can't run an online store.</div>
      )}
      {data.eligible && !data.pageLive && (
        <div className="rounded-xl bg-warning-soft text-warning px-4 py-3 text-[13px] font-semibold">Your business page isn't published yet. Publish it under Setup first — the online store lives on that page.</div>
      )}

      <Panel title="Online store" subtitle="Let customers register on your page, then order from it" icon={Store} tone="brand">
        <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-2 border border-line px-4 py-3">
          <div>
            <div className="text-[13.5px] font-bold text-t1">Store is {draft.enabled ? "on" : "off"}</div>
            <div className="text-[12px] text-t3">{draft.enabled ? "Visitors must register or sign in before they can see your page or order." : "Your page stays open to everyone, with no ordering."}</div>
          </div>
          <Switch on={draft.enabled} onChange={(v) => set("enabled", v)} label="Online store" />
        </div>
        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px] text-t3">
          <li>• Every customer who registers is added to your Customers, marked “website”.</li>
          <li>• Orders appear under Online orders, with a notification.</li>
          <li>• Confirming an order records the sale and takes the stock off.</li>
          <li>• Customers follow each order from placed to delivered.</li>
        </ul>
        <div className="mt-4"><Row title="Taking orders" hint={draft.acceptingOrders ? "Customers can place orders." : "Paused — customers can browse but not order."} on={draft.acceptingOrders} onChange={(v) => set("acceptingOrders", v)} /></div>
      </Panel>

      {link && (
        <Panel title="Share with customers" subtitle="They open your page from the link or by scanning the code" icon={QrCode} tone="success">
          <div className="flex gap-5 flex-wrap items-start">
            {qr ? <img src={qr} alt="QR code for your online store" className="w-36 h-36 rounded-2xl border border-line bg-white p-1.5" /> : <div className="w-36 h-36 rounded-2xl bg-surface-3" />}
            <div className="space-y-3 min-w-[240px] flex-1">
              <div className="text-[13px] text-t2 break-all font-medium">{link}</div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy link"}
                </Button>
                {qr && <a href={qr} download={`${data.slug}-store-qr.png`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-line-2 text-[12.5px] font-bold text-t1 hover:border-primary hover:text-primary">Download QR</a>}
                {qr && <Button variant="secondary" size="sm" onClick={printPoster}><Printer className="w-3.5 h-3.5" /> Print poster</Button>}
              </div>
              <div className="flex gap-5 text-[12.5px] text-t3 pt-1">
                <span className="inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /><b className="text-t1">{data.visits.toLocaleString()}</b> visits</span>
                <span className="inline-flex items-center gap-1.5"><ScanLine className="w-3.5 h-3.5" /><b className="text-t1">{data.qrScans.toLocaleString()}</b> QR scans</span>
              </div>
              <p className="text-[11.5px] text-t4">Anyone who scans or opens the link lands on your sign-up page, then straight into your shop.</p>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Pickup & delivery" subtitle="How customers receive what they order" icon={Truck} tone="warning">
        <div className="space-y-3">
          <Row title="Pickup" hint="Customers collect from your shop" on={draft.pickup} onChange={(v) => set("pickup", v)} />
          <Row title="Delivery" hint="You bring it to them" on={draft.delivery} onChange={(v) => set("delivery", v)}>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={`Delivery fee (${data.currency})`}><Input inputMode="decimal" value={String(draft.deliveryFee)} onChange={(e) => set("deliveryFee", num(e.target.value))} /></Field>
              <Field label="Free delivery over" hint="0 = never free"><Input inputMode="decimal" value={String(draft.freeDeliveryOver)} onChange={(e) => set("freeDeliveryOver", num(e.target.value))} /></Field>
            </div>
            <div className="mt-3"><Field label="Areas you deliver to" hint="Shown at checkout, e.g. “Lekki, Ikoyi, Victoria Island”."><Input value={draft.deliveryAreas} maxLength={200} onChange={(e) => set("deliveryAreas", e.target.value)} /></Field></div>
          </Row>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label={`Minimum order (${data.currency})`} hint="0 = no minimum"><Input inputMode="decimal" value={String(draft.minOrder)} onChange={(e) => set("minOrder", num(e.target.value))} /></Field>
            <Field label="How long it takes" hint="Shown to customers, e.g. “Ready in 30 minutes”."><Input value={draft.leadTime} maxLength={80} onChange={(e) => set("leadTime", e.target.value)} /></Field>
          </div>
          {data.branches.length > 1 && (
            <Field label="Sell online from" hint="Online orders take stock from this branch.">
              <Select value={draft.branchId || ""} onChange={(e) => set("branchId", e.target.value || null)}>
                <option value="">{data.branches[0].name} (default)</option>
                {data.branches.slice(1).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
        </div>
      </Panel>

      <Panel title="Payment" subtitle="How customers can pay. Nobody pays online — you confirm each order." icon={Wallet} tone="success">
        <div className="space-y-3">
          <Row title="Pay on delivery" hint="Cash or transfer to your rider" on={draft.payOnDelivery} onChange={(v) => set("payOnDelivery", v)} />
          <Row title="Pay at pickup" hint="Pay when they collect" on={draft.payAtPickup} onChange={(v) => set("payAtPickup", v)} />
          <Row title="Bank transfer" hint="They transfer to your account and you confirm it" on={draft.transfer} onChange={(v) => set("transfer", v)}>
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Bank"><Input value={draft.bankName} maxLength={60} onChange={(e) => set("bankName", e.target.value)} placeholder="GTBank" /></Field>
              <Field label="Account name"><Input value={draft.accountName} maxLength={80} onChange={(e) => set("accountName", e.target.value)} /></Field>
              <Field label="Account number"><Input inputMode="numeric" value={draft.accountNumber} maxLength={24} onChange={(e) => set("accountNumber", e.target.value.replace(/[^0-9 -]/g, ""))} /></Field>
            </div>
            {bankMissing && <p className="mt-2 text-[12px] text-warning font-semibold">Add all three so customers know where to pay.</p>}
          </Row>
          <Field label="Note for customers (optional)" hint="Shown after they order, e.g. “Call 0803… if you're running late”."><Input value={draft.instructions} maxLength={300} onChange={(e) => set("instructions", e.target.value)} /></Field>
        </div>
      </Panel>

      <div className="flex items-center gap-3 flex-wrap sticky bottom-4 rounded-2xl border border-line bg-surface/95 backdrop-blur px-4 py-3 shadow-e3">
        <span className="text-[12.5px] text-t3 mr-auto">{saving ? "Saving…" : dirty ? "You have unsaved changes" : justSaved ? "Saved" : "No changes"}</span>
        <Link to="/app/orders" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary hover:underline"><Bike className="w-3.5 h-3.5" /> Online orders</Link>
        {dirty && <Button variant="ghost" size="sm" onClick={() => saved && setDraft(saved)}>Discard</Button>}
        <Button onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save store settings</Button>
      </div>
    </div>
  );
}
