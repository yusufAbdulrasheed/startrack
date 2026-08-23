import { useEffect, useState } from "react";
import { Save, Plus, MapPin, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";

type SettingsData = {
  business: {
    id: string; name: string; typeKey: string; typeLabel: string; code: string;
    settings: { currency: string; vatEnabled: boolean; vatRate: number; receiptFooter: string; alertEmail: string; modules: string[] };
  };
  branches: { id: string; name: string; address: string }[];
  availableModules: { key: string; label: string; hint: string }[];
};

export function Settings() {
  const { can } = useSession();
  const { data, loading, reload } = useApi<SettingsData>("/settings", []);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);

  useEffect(() => {
    if (data && !form) {
      setForm({
        name: data.business.name,
        currency: data.business.settings.currency,
        vatEnabled: data.business.settings.vatEnabled,
        vatRate: data.business.settings.vatRate,
        receiptFooter: data.business.settings.receiptFooter,
        alertEmail: data.business.settings.alertEmail,
      });
    }
  }, [data, form]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setSaved(false);
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify({ ...form, vatRate: Number(form.vatRate) || 0 }) });
      setSaved(true);
      reload();
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !form) return <div className="p-8"><Spinner /></div>;

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader
        title="Settings"
        subtitle={`${data!.business.typeLabel} · profile, tax, receipts and modules — changes are audited`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card className="p-5">
          <form onSubmit={save} className="space-y-3">
            <div className="text-[14px] font-bold text-t1 mb-1">Business profile</div>
            <ErrorBanner message={error} />
            {saved && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold">Saved.</div>}
            <Field label="Business name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency symbol"><Input required maxLength={4} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
              <Field label="Alert email" hint="Low-stock alerts land here (soon)">
                <Input type="email" value={form.alertEmail} onChange={(e) => setForm({ ...form, alertEmail: e.target.value })} placeholder="you@business.com" />
              </Field>
            </div>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-ctl bg-surface-2 border border-line">
              <div>
                <div className="text-[13px] font-semibold text-t1">Charge VAT</div>
                <div className="text-[11px] text-t3">Added on top of the discounted subtotal</div>
              </div>
              <div className="flex items-center gap-2">
                {form.vatEnabled && (
                  <div className="flex items-center gap-1">
                    <Input type="number" min="0" max="50" step="0.5" value={form.vatRate} onChange={(e) => setForm({ ...form, vatRate: e.target.value })} className="!w-20 !h-8 text-right" />
                    <span className="text-[12px] text-t3">%</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setForm({ ...form, vatEnabled: !form.vatEnabled })}
                  className={`w-11 h-6 rounded-full transition-colors relative ${form.vatEnabled ? "bg-primary" : "bg-surface-3 border border-line-2"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.vatEnabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>

            <Field label="Receipt footer"><Input value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} placeholder="Thank you for your patronage!" /></Field>
            <Button type="submit" disabled={busy}><Save className="w-4 h-4" /> {busy ? "Saving…" : "Save settings"}</Button>
          </form>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <div className="text-[14px] font-bold text-t1">Till login code</div>
            </div>
            <div className="text-[12px] text-t3 mb-3">Staff type this once on a till device, then sign in with only their PIN.</div>
            <div className="font-mono text-[24px] font-extrabold tracking-[0.35em] text-primary text-center py-3 rounded-ctl bg-primary-softer border border-line">
              {data!.business.code}
            </div>
          </Card>

          <ModulesCard
            available={data!.availableModules}
            enabled={data!.business.settings.modules}
          />

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-bold text-t1">Branches</div>
              {can("*") && (
                <Button size="sm" variant="secondary" onClick={() => setAddingBranch(true)}><Plus className="w-3.5 h-3.5" /> Add branch</Button>
              )}
            </div>
            <div className="space-y-2">
              {data!.branches.map((b) => (
                <div key={b.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-ctl bg-surface-2 border border-line">
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-t1 truncate">{b.name}</div>
                    {b.address && <div className="text-[11px] text-t3 truncate">{b.address}</div>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <AddBranch open={addingBranch} onClose={() => setAddingBranch(false)} onSaved={() => { setAddingBranch(false); reload(); }} />
    </div>
  );
}

function ModulesCard({ available, enabled }: { available: { key: string; label: string; hint: string }[]; enabled: string[] }) {
  const [modules, setModules] = useState<string[]>(enabled);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify([...modules].sort()) !== JSON.stringify([...enabled].sort());

  const toggle = (key: string) =>
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]));

  async function save() {
    setBusy(true);
    try {
      await api("/settings", { method: "PATCH", body: JSON.stringify({ modules }) });
      // The sidebar reads modules from the session — refresh to apply everywhere.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="text-[14px] font-bold text-t1">What this business uses</div>
      <div className="text-[12px] text-t3 mb-3">Switch off anything you don't need — it disappears from the menu for everyone.</div>
      <div className="space-y-1.5">
        {available.map((m) => {
          const on = modules.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggle(m.key)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-ctl bg-surface-2 border border-line text-left hover:border-brand-300 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-t1">{m.label}</div>
                <div className="text-[11px] text-t3">{m.hint}</div>
              </div>
              <span className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${on ? "bg-primary" : "bg-surface-3 border border-line-2"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </button>
          );
        })}
      </div>
      {dirty && (
        <Button className="w-full mt-3" disabled={busy} onClick={save}>
          <Save className="w-4 h-4" /> {busy ? "Applying…" : "Apply module changes"}
        </Button>
      )}
    </Card>
  );
}

function AddBranch({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", address: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/settings/branches", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", address: "" });
      onSaved();
      // New branch appears in the switcher on next sign-in refresh.
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a branch" subtitle="Transfers and per-branch dashboards light up automatically">
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Branch name"><Input autoFocus required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Retail — Main Market" /></Field>
        <Field label="Address"><Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Optional" /></Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding…" : "Add branch"}</Button>
      </form>
    </Modal>
  );
}
