import { useState } from "react";
import { History, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { Input, TextArea, ErrorBanner } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";
import { fmtMoney, fmtTime, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Sale = {
  id: string; saleNo: string; at: string; total: number; status: string;
  items: { name: string; qty: number }[];
  payments: { method: string; amount: number }[];
};

export function Activity() {
  const { activeBranch, currency, can } = useSession();
  const [date, setDate] = useState(todayStr);
  const { data, loading, reload } = useApi<{ sales: Sale[] }>(`/sales?mine=1&date=${date}&limit=100`, [activeBranch?.id]);
  const sales = data?.sales || [];
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const total = sales.filter((s) => s.status === "completed").reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader
        title="My Activity"
        subtitle="Your own sales — what you rang up, when"
        actions={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="!w-40" />}
      />

      <div className="flex items-center gap-3 mb-4 text-[13px] text-t2">
        <span>{sales.length} sale{sales.length === 1 ? "" : "s"}</span>
        <span className="text-t4">·</span>
        <span>Total <span className="font-mono font-bold text-t1">{fmtMoney(total, currency)}</span></span>
      </div>

      {loading ? (
        <Spinner />
      ) : sales.length === 0 ? (
        <Card>
          <EmptyState icon={History} title="No sales this day" body="Everything you sell on the POS shows up here with its receipt number." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {sales.map((s) => (
              <div key={s.id} className={cn("flex items-center gap-3 px-4 py-3", s.status === "voided" && "opacity-45")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-bold text-primary">{s.saleNo}</span>
                    {s.status === "voided" && <Badge tone="danger">voided</Badge>}
                    <span className="text-[11px] text-t4">{fmtTime(s.at)}</span>
                  </div>
                  <div className="text-[12px] text-t3 truncate">{s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(s.total, currency)}</div>
                  <div className="text-[10px] uppercase text-t4">{s.payments.map((p) => p.method).join(" + ")}</div>
                </div>
                {can("void_sales") && s.status === "completed" && (
                  <Button size="sm" variant="secondary" onClick={() => setVoiding(s)}><Ban className="w-3.5 h-3.5" /> Void</Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <VoidModal sale={voiding} currency={currency} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); reload(); }} />
    </div>
  );
}

function VoidModal({ sale, currency, onClose, onDone }: { sale: Sale | null; currency: string; onClose: () => void; onDone: () => void }) {
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
