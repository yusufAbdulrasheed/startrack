import { useState } from "react";
import { ReceiptText, Download, Search, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { Input, Select, TextArea, ErrorBanner } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { downloadCsv } from "@/lib/csv";
import { fmtDateTime, fmtMoney, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sale = {
  id: string; saleNo: string; at: string; staffName: string; customerName: string;
  items: { name: string; qty: number; unitPrice: number; lineNet: number }[];
  subtotal: number; discount: number; vat: number; total: number;
  payments: { method: string; amount: number }[];
  status: string;
  voidInfo?: { byName?: string; reason?: string; at?: string };
};
type Totals = { count: number; completed: number; voided: number; revenue: number; discount: number; vat: number };

export function Sales() {
  const { activeBranch, currency, can } = useSession();
  const [from, setFrom] = useState(() => todayStr().slice(0, 8) + "01"); // this month
  const [to, setTo] = useState(todayStr);
  const [status, setStatus] = useState("");
  const [saleNo, setSaleNo] = useState("");
  const query = `/sales?from=${from}&to=${to}${status ? `&status=${status}` : ""}${saleNo ? `&saleNo=${encodeURIComponent(saleNo)}` : ""}&limit=500`;
  const { data, loading, reload } = useApi<{ sales: Sale[]; totals: Totals }>(query, [activeBranch?.id]);
  const sales = data?.sales || [];
  const t = data?.totals;
  const [selected, setSelected] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);

  function exportCsv() {
    downloadCsv(
      `sales-${from}-to-${to}.csv`,
      sales.map((s) => ({
        receipt: s.saleNo,
        datetime: fmtDateTime(s.at),
        staff: s.staffName,
        customer: s.customerName || "",
        items: s.items.map((i) => `${i.name} x${i.qty}`).join("; "),
        subtotal: s.subtotal,
        discount: s.discount,
        vat: s.vat,
        total: s.total,
        payment: s.payments.map((p) => p.method).join("+"),
        status: s.status,
      }))
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Sales History"
        subtitle={`${activeBranch?.name || ""} · every sale on record — voided ones stay, flagged`}
        actions={<Button variant="secondary" onClick={exportCsv} disabled={!sales.length}><Download className="w-4 h-4" /> Export CSV</Button>}
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
        <span className="text-t4 text-[12px]">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-36">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
          <Input value={saleNo} onChange={(e) => setSaleNo(e.target.value)} placeholder="Receipt no." className="!w-40 !pl-9" />
        </div>
      </div>

      {/* Totals bar */}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          {[
            { l: "Sales", v: String(t.completed) },
            { l: "Voided", v: String(t.voided) },
            { l: "Revenue", v: fmtMoney(t.revenue, currency) },
            { l: "Discounts", v: fmtMoney(t.discount, currency) },
            { l: "VAT", v: fmtMoney(t.vat, currency) },
            { l: "Avg sale", v: t.completed > 0 ? fmtMoney(t.revenue / t.completed, currency) : "—" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl bg-surface border border-line px-3 py-2.5">
              <div className="text-[15px] font-bold font-mono text-t1 tabular-nums truncate">{s.v}</div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-t3 mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : sales.length === 0 ? (
        <Card>
          <EmptyState icon={ReceiptText} title="No sales in this period" body="Adjust the date range, or make some sales on the POS." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-left">
                  {["Receipt", "Items", "Staff", "Customer", "Method", "Status", "Total"].map((h, i) => (
                    <th key={h} className={cn("px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-t4 border-b border-line", i === 6 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className={cn("cursor-pointer hover:bg-surface-2 transition-colors border-b border-line last:border-0", s.status === "voided" && "opacity-50")}
                  >
                    <td className="px-4 py-3">
                      <div className="font-mono text-[12px] font-semibold text-primary">{s.saleNo}</div>
                      <div className="text-[11px] text-t4">{fmtDateTime(s.at)}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-t2 max-w-[220px] truncate">
                      {s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-t2">{s.staffName}</td>
                    <td className="px-4 py-3 text-[12px] text-t3">{s.customerName || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={s.payments[0]?.method === "cash" ? "success" : s.payments[0]?.method === "pos" ? "brand" : "warning"}>
                        {s.payments.map((p) => p.method).join("+")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "voided" ? <Badge tone="danger">voided</Badge> : <Badge tone="success">completed</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(s.total, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SaleDetail
        sale={selected}
        currency={currency}
        canVoid={can("void_sales")}
        onClose={() => setSelected(null)}
        onVoid={(s) => { setSelected(null); setVoiding(s); }}
      />
      <VoidSale sale={voiding} currency={currency} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); reload(); }} />
    </div>
  );
}

function SaleDetail({ sale, currency, canVoid, onClose, onVoid }: {
  sale: Sale | null; currency: string; canVoid: boolean; onClose: () => void; onVoid: (s: Sale) => void;
}) {
  if (!sale) return null;
  return (
    <Modal open={!!sale} onClose={onClose} title={`${sale.saleNo}`} subtitle={`${fmtDateTime(sale.at)} · by ${sale.staffName}${sale.customerName ? ` · for ${sale.customerName}` : ""}`}>
      {sale.status === "voided" && (
        <div className="px-3 py-2.5 mb-3 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">
          Voided by {sale.voidInfo?.byName}{sale.voidInfo?.reason ? ` — "${sale.voidInfo.reason}"` : ""}
        </div>
      )}
      <div className="space-y-1.5">
        {sale.items.map((i, idx) => (
          <div key={idx} className="flex justify-between text-[13px]">
            <span className="text-t2">{i.name} ×{i.qty}</span>
            <span className="font-mono text-t1 tabular-nums">{fmtMoney(i.lineNet, currency)}</span>
          </div>
        ))}
        <div className="pt-2 mt-2 border-t border-line space-y-1">
          <div className="flex justify-between text-[12px] text-t2"><span>Subtotal</span><span className="font-mono">{fmtMoney(sale.subtotal, currency)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between text-[12px] text-danger"><span>Discount</span><span className="font-mono">−{fmtMoney(sale.discount, currency)}</span></div>}
          {sale.vat > 0 && <div className="flex justify-between text-[12px] text-t2"><span>VAT</span><span className="font-mono">{fmtMoney(sale.vat, currency)}</span></div>}
          <div className="flex justify-between text-[15px] font-bold text-t1 pt-1"><span>Total</span><span className="font-mono">{fmtMoney(sale.total, currency)}</span></div>
          <div className="text-[11px] text-t3">Paid via {sale.payments.map((p) => `${p.method.toUpperCase()} ${fmtMoney(p.amount, currency)}`).join(" + ")}</div>
        </div>
      </div>
      {canVoid && sale.status === "completed" && (
        <Button variant="danger" className="w-full mt-4" onClick={() => onVoid(sale)}>
          <Ban className="w-4 h-4" /> Void this sale
        </Button>
      )}
    </Modal>
  );
}

function VoidSale({ sale, currency, onClose, onDone }: { sale: Sale | null; currency: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(`/sales/${sale!.id}/void`, { method: "POST", body: JSON.stringify({ reason }) });
      setReason("");
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title={`Void ${sale?.saleNo}?`}
      subtitle={`${fmtMoney(sale?.total || 0, currency)} — stock returns to the shelf, the sale stays on record flagged as void`}
    >
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <TextArea autoFocus required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this sale being voided?" />
        <Button type="submit" variant="danger" className="w-full" disabled={busy}>
          <Ban className="w-4 h-4" /> {busy ? "Voiding…" : "Void this sale"}
        </Button>
      </form>
    </Modal>
  );
}
