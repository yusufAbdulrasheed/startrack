import { useState } from "react";
import { Users, Plus, Search, Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, TextArea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { usePaged, Pager } from "@/components/ui/Pager";
import { useSession } from "@/lib/session";
import { fmtDate, fmtMoney, fmtDateTime } from "@/lib/format";

type Customer = {
  id: string; name: string; phone: string; whatsapp: string; notes: string;
  totalSpend: number; visits: number; firstSeen: string; lastSeen: string;
};
type CustomerSale = { id: string; saleNo: string; at: string; total: number; status: string; summary: string };

export function Customers() {
  const { currency } = useSession();
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi<{ customers: Customer[] }>(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`, []);
  const customers = data?.customers || [];
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const paged = usePaged(customers);

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <PageHeader
        title="Customers"
        subtitle="Everyone who's bought from you — built automatically from sales"
        actions={<Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add customer</Button>}
      />

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={q ? "No matches" : "No customers yet"}
            body={q ? "Try a different name or number." : "Attach a customer during checkout (or add one here) and their spend and visits build automatically."}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {paged.rows.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                <div className="w-9 h-9 rounded-full bg-primary-soft text-primary font-bold text-[13px] flex items-center justify-center shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-t1 truncate">{c.name}</div>
                  <div className="text-[11px] text-t3 flex items-center gap-1">
                    {c.phone && <><Phone className="w-3 h-3" /> {c.phone} · </>}last seen {fmtDate(c.lastSeen)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[13px] font-bold text-t1 tabular-nums">{fmtMoney(c.totalSpend, currency)}</div>
                  <div className="text-[11px] text-t4">{c.visits} visit{c.visits === 1 ? "" : "s"}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-t4 shrink-0" />
              </button>
            ))}
          </div>
          <Pager {...paged} onPage={paged.setPage} noun="customers" />
        </Card>
      )}

      <AddCustomer open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      <CustomerDetail customer={selected} currency={currency} onClose={() => setSelected(null)} onChanged={reload} />
    </div>
  );
}

function AddCustomer({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/customers", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", phone: "", notes: "" });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add customer">
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Name"><Input autoFocus required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
        <Field label="Phone / WhatsApp"><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Add customer"}</Button>
      </form>
    </Modal>
  );
}

function CustomerDetail({ customer, currency, onClose }: { customer: Customer | null; currency: string; onClose: () => void; onChanged: () => void }) {
  const { data, loading } = useApi<{ customer: Customer; sales: CustomerSale[] }>(
    customer ? `/customers/${customer.id}` : null,
    [customer?.id]
  );

  if (!customer) return null;
  const c = data?.customer || customer;

  return (
    <Modal open={!!customer} onClose={onClose} title={c.name} subtitle={c.phone || "No phone on file"} wide>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { l: "Total spend", v: fmtMoney(c.totalSpend, currency) },
          { l: "Visits", v: String(c.visits) },
          { l: "Customer since", v: fmtDate(c.firstSeen) },
        ].map((s) => (
          <div key={s.l} className="rounded-xl bg-surface-2 border border-line p-3">
            <div className="text-[15px] font-bold font-mono text-t1">{s.v}</div>
            <div className="text-[10px] font-medium text-t3 mt-0.5">{s.l}</div>
          </div>
        ))}
      </div>
      {c.notes && <div className="text-[12px] text-t2 px-3 py-2 rounded-ctl bg-surface-2 border border-line mb-4">{c.notes}</div>}
      <div className="text-[12px] font-bold uppercase tracking-wide text-t3 mb-2">Purchase history</div>
      {loading ? (
        <Spinner />
      ) : !data?.sales.length ? (
        <div className="text-[12px] text-t4 py-4 text-center">No purchases recorded yet.</div>
      ) : (
        <div className="divide-y divide-line">
          {data.sales.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-primary">{s.saleNo}</span>
                  {s.status === "voided" && <Badge tone="danger">voided</Badge>}
                  <span className="text-[11px] text-t4">{fmtDateTime(s.at)}</span>
                </div>
                <div className="text-[12px] text-t3 truncate">{s.summary}</div>
              </div>
              <span className="font-mono text-[13px] font-bold text-t1 tabular-nums shrink-0">{fmtMoney(s.total, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
