import { useState } from "react";
import { ReceiptText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePaged, Pager } from "@/components/ui/Pager";
import { useSession } from "@/lib/session";
import { fmtDateTime, fmtMoney, todayStr } from "@/lib/format";

type Expense = { id: string; type: string; amount: number; notes: string; paidBy: string; actorName: string; at: string };

const QUICK_TYPES = ["Fuel", "Rent", "Salaries", "Transport", "Utilities", "Supplies", "Repairs"];

export function Expenses() {
  const { activeBranch, currency } = useSession();
  const [from, setFrom] = useState(() => todayStr().slice(0, 8) + "01"); // this month
  const [to, setTo] = useState(todayStr);
  const { data, loading, reload } = useApi<{ expenses: Expense[]; total: number }>(
    `/expenses?from=${from}&to=${to}`,
    [activeBranch?.id]
  );
  const [adding, setAdding] = useState(false);
  const paged = usePaged(data?.expenses || []);

  async function remove(e: Expense) {
    if (!confirm(`Delete this ${e.type} expense of ${fmtMoney(e.amount, currency)}? The day's numbers will be corrected.`)) return;
    await api(`/expenses/${e.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto">
      <PageHeader
        title="Expenses"
        subtitle={`${activeBranch?.name || ""} · spending comes straight off the day's profit`}
        actions={<Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Record expense</Button>}
      />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="!w-40" />
        <span className="text-t4 text-[12px]">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="!w-40" />
        {data && (
          <div className="ml-auto text-[13px] text-t2">
            Total: <span className="font-mono font-bold text-t1">{fmtMoney(data.total, currency)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : !data?.expenses.length ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title="No expenses in this period"
            body="Fuel, rent, salaries — record them here and the dashboard's profit stays honest."
            action={<Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Record your first expense</Button>}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {paged.rows.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-lg bg-danger-soft text-danger flex items-center justify-center shrink-0">
                  <ReceiptText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-t1">{e.type}</div>
                  <div className="text-[11px] text-t3 truncate">
                    {e.notes && `${e.notes} · `}{e.paidBy && `paid by ${e.paidBy} · `}{e.actorName} · {fmtDateTime(e.at)}
                  </div>
                </div>
                <span className="font-mono text-[14px] font-bold text-t1 tabular-nums shrink-0">{fmtMoney(e.amount, currency)}</span>
                <button onClick={() => remove(e)} className="p-1.5 rounded-lg text-t4 hover:text-danger hover:bg-danger-soft transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <Pager {...paged} onPage={paged.setPage} noun="expenses" />

        </Card>
      )}

      <AddExpense open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
    </div>
  );
}

function AddExpense({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ type: "", amount: "" as string | number, notes: "", paidBy: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/expenses", {
        method: "POST",
        body: JSON.stringify({ ...form, amount: Number(form.amount) || 0 }),
      });
      setForm({ type: "", amount: "", notes: "", paidBy: "" });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record an expense" subtitle="It reduces today's profit on the dashboard">
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TYPES.map((t) => (
            <button
              key={t} type="button"
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={`px-2.5 h-7 rounded-full text-[11px] font-semibold border transition-colors ${form.type === t ? "bg-primary-soft border-brand-400 text-primary" : "bg-surface-2 border-line-2 text-t3 hover:text-t1"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <Field label="Type"><Input required value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} placeholder="Fuel" /></Field>
        <Field label="Amount"><Input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by"><Input value={form.paidBy} onChange={(e) => setForm((f) => ({ ...f, paidBy: e.target.value }))} placeholder="Optional" /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" /></Field>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Record expense"}</Button>
      </form>
    </Modal>
  );
}
