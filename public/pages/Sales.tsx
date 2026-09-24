import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ReceiptText, Download, Search, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { Input, Select, TextArea, ErrorBanner } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { Table, TR, TH, TD } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { downloadCsv } from "@/lib/csv";
import { ROWS_PER_PAGE } from "@/components/ui/Pager";
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
type Totals = {
  count: number; completed: number; voided: number;
  revenue: number; discount: number; vat: number;
  // Null when the filter is narrower than a date range — a refund can't be
  // attributed to one cashier or one receipt, so the server declines to guess.
  refunds: number | null; refundCount: number | null; net: number | null;
};

// Short pages on purpose — these are scanned, not read.
const PAGE_SIZE = ROWS_PER_PAGE;

export function Sales() {
  const { activeBranch } = useSession();
  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
      <PageHeader
        title="Sales History"
        subtitle={`${activeBranch?.name || ""} · every sale on record — voided ones stay, flagged`}
      />
      <SalesHistoryView />
    </div>
  );
}

// The archive itself — used by the Sales History page AND the dashboard's
// Archive tab, so both always show exactly the same truth.
export function SalesHistoryView() {
  const { activeBranch, currency, can } = useSession();
  const [searchParams] = useSearchParams();
  const [from, setFrom] = useState(() => todayStr().slice(0, 8) + "01"); // this month
  const [to, setTo] = useState(todayStr);
  const [status, setStatus] = useState("");
  const [saleNo, setSaleNo] = useState(searchParams.get("saleNo") || "");
  const [page, setPage] = useState(1);

  // The header's global search lands here with ?saleNo= — a receipt from any
  // date needs to surface, so widen the window past the "this month" default.
  useEffect(() => {
    const fromUrl = searchParams.get("saleNo");
    if (fromUrl) { setSaleNo(fromUrl); setFrom("2000-01-01"); setPage(1); }
  }, [searchParams]);
  const filters = `from=${from}&to=${to}${status ? `&status=${status}` : ""}${saleNo ? `&saleNo=${encodeURIComponent(saleNo)}` : ""}`;
  const query = `/sales?${filters}&page=${page}&limit=${PAGE_SIZE}`;
  const { data, loading, reload } = useApi<{ sales: Sale[]; totals: Totals; page: number; pages: number }>(
    query,
    [activeBranch?.id]
  );
  const sales = data?.sales || [];
  const t = data?.totals;
  const pages = data?.pages || 1;
  const [selected, setSelected] = useState<Sale | null>(null);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [exporting, setExporting] = useState(false);

  // Changing a filter must start again from the first page, or you land on
  // page 7 of a two-page result and see nothing.
  const setFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const csvRow = (s: Sale) => ({
    receipt: s.saleNo,
    datetime: fmtDateTime(s.at),
    staff: s.staffName,
    customer: s.customerName || "",
    items: s.items.map((i) => `${i.name} x${i.qty}`).join("; "),
    subtotal: s.subtotal,
    discount: s.discount,
    vat: s.vat,
    total: s.total,
    payment: s.payments.map((p) => `${p.method} ${p.amount}`).join(" + "),
    status: s.status,
  });

  // Export the whole filtered period, not just the page on screen — an export
  // that silently stopped at 50 rows would be worse than none.
  async function exportCsv() {
    setExporting(true);
    try {
      const all: Sale[] = [];
      for (let p = 1; p <= pages; p++) {
        const chunk = await api<{ sales: Sale[] }>(`/sales?${filters}&page=${p}&limit=${PAGE_SIZE}`);
        all.push(...chunk.sales);
      }
      downloadCsv(`sales-${from}-to-${to}.csv`, all.map(csvRow));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input type="date" value={from} onChange={(e) => setFilter(setFrom)(e.target.value)} className="!w-40" />
        <span className="text-t4 text-[12px]">to</span>
        <Input type="date" value={to} onChange={(e) => setFilter(setTo)(e.target.value)} className="!w-40" />
        <Select value={status} onChange={(e) => setFilter(setStatus)(e.target.value)} className="!w-36">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
          <Input value={saleNo} onChange={(e) => setFilter(setSaleNo)(e.target.value)} placeholder="Receipt no." className="!w-40 !pl-9" />
        </div>
        <Button variant="secondary" className="ml-auto" onClick={exportCsv} disabled={!sales.length || exporting}>
          <Download className="w-4 h-4" /> {exporting ? "Preparing…" : `Export CSV${t && t.count > sales.length ? ` (${t.count})` : ""}`}
        </Button>
      </div>

      {/* Totals bar */}
      {t && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          {[
            { l: "Sales", v: String(t.completed) },
            { l: "Voided", v: String(t.voided) },
            { l: "Revenue", v: fmtMoney(t.revenue, currency), hint: "Completed sales, before refunds" },
            ...(t.refunds !== null
              ? [{
                  l: `Refunds${t.refundCount ? ` · ${t.refundCount}` : ""}`,
                  v: t.refunds > 0 ? `−${fmtMoney(t.refunds, currency)}` : fmtMoney(0, currency),
                  tone: t.refunds > 0 ? "text-danger" : undefined,
                }]
              : []),
            // The figure the dashboard reports, shown here so the two agree.
            ...(t.net !== null
              ? [{ l: "Net taken", v: fmtMoney(t.net, currency), strong: true, hint: "Revenue less refunds — matches the dashboard" }]
              : []),
            { l: "VAT", v: fmtMoney(t.vat, currency) },
            { l: "Avg sale", v: t.completed > 0 ? fmtMoney(t.revenue / t.completed, currency) : "—" },
          ].map((s: any) => (
            <div
              key={s.l}
              title={s.hint}
              className={cn(
                "rounded-xl border px-3 py-2.5",
                s.strong ? "bg-primary-softer border-brand-300" : "bg-surface border-line"
              )}
            >
              <div className={cn("text-[15px] font-bold font-mono tabular-nums truncate", s.tone || (s.strong ? "text-primary" : "text-t1"))}>
                {s.v}
              </div>
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
            <Table className="min-w-[720px]">
              <thead>
                <tr className="text-left">
                  {["Receipt", "Items", "Staff", "Customer", "Method", "Status", "Total"].map((h, i) => (
                    <TH key={h} className={cn(i === 6 && "text-right")}>{h}</TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <TR
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className={cn("cursor-pointer", s.status === "voided" && "opacity-50")}
                  >
                    <TD>
                      <div className="font-mono text-[12px] font-semibold text-primary">{s.saleNo}</div>
                      <div className="text-[11px] text-t4">{fmtDateTime(s.at)}</div>
                    </TD>
                    <TD className="!text-t2 max-w-[220px] truncate">
                      {s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}
                    </TD>
                    <TD className="!text-[12px] !text-t2">{s.staffName}</TD>
                    <TD className="!text-[12px] !text-t3">{s.customerName || "—"}</TD>
                    <TD>
                      <Badge tone={s.payments[0]?.method === "cash" ? "success" : s.payments[0]?.method === "pos" ? "brand" : "warning"}>
                        {s.payments.map((p) => p.method).join("+")}
                      </Badge>
                    </TD>
                    <TD>
                      {s.status === "voided" ? <Badge tone="danger">voided</Badge> : <Badge tone="success">completed</Badge>}
                    </TD>
                    <TD className="text-right font-mono font-bold tabular-nums">{fmtMoney(s.total, currency)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>

          {/* Pager. The totals bar above always covers the WHOLE period, not
              this page — so paging never changes the figures being read. */}
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line">
              <div className="text-[12px] text-t3">
                Showing <span className="font-semibold text-t2">{(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + sales.length}</span>
                {" "}of <span className="font-semibold text-t2">{t?.count ?? 0}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-8 px-3 rounded-lg border border-line-2 bg-surface text-[12px] font-semibold text-t2 hover:text-primary hover:border-brand-400 disabled:opacity-40 disabled:hover:text-t2 disabled:hover:border-line-2 transition-colors"
                >
                  Previous
                </button>
                <span className="px-2 text-[12px] font-mono text-t3 tabular-nums">{page} / {pages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages || loading}
                  className="h-8 px-3 rounded-lg border border-line-2 bg-surface text-[12px] font-semibold text-t2 hover:text-primary hover:border-brand-400 disabled:opacity-40 disabled:hover:text-t2 disabled:hover:border-line-2 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
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
