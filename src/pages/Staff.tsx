import { useState } from "react";
import { UserCog, Plus, KeyRound, Ban, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/session";

type Staff = {
  id: string; userId: string; name: string; email: string; role: string;
  branchId: string | null; branchName: string; hasPin: boolean; status: string; permsOverride: string[];
};

const ROLE_TONE: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  owner: "brand", admin: "success", manager: "warning", staff: "neutral",
};

export function Staff() {
  const { session, branchesForActive, can } = useSession();
  const { data, loading, reload } = useApi<{ staff: Staff[] }>("/staff", []);
  const { data: settingsData } = useApi<{ business: { code: string } }>(can("settings") ? "/settings" : null, []);
  const staff = data?.staff || [];
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<Staff | null>(null);
  const [copied, setCopied] = useState(false);
  const code = settingsData?.business.code;

  async function toggleStatus(s: Staff) {
    const next = s.status === "active" ? "inactive" : "active";
    if (next === "inactive" && !confirm(`Suspend ${s.name}? They lose access immediately (PIN included).`)) return;
    await api(`/staff/${s.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    reload();
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto">
      <PageHeader
        title="Staff"
        subtitle="Roles decide what each person can see and do — enforced by the server"
        actions={<Button onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add staff</Button>}
      />

      {code && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 rounded-card bg-primary-softer border border-line">
          <KeyRound className="w-4 h-4 text-primary shrink-0" />
          <div className="text-[13px] text-t2">
            Till login code for this business: <span className="font-mono font-extrabold text-primary tracking-[0.2em]">{code}</span>
            <span className="text-t3"> — staff enter it once on the till, then sign in with just their PIN.</span>
          </div>
          <Button size="sm" variant="secondary" className="ml-auto shrink-0" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            <Copy className="w-3.5 h-3.5" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <Card className="overflow-hidden">
          {staff.length === 0 ? (
            <EmptyState icon={UserCog} title="Just you so far" body="Add your first staff member with a role, branch and till PIN." />
          ) : (
            <div className="divide-y divide-line">
              {staff.map((s) => (
                <div key={s.id} className={`flex items-center gap-3 px-4 py-3 ${s.status === "inactive" ? "opacity-50" : ""}`}>
                  <div className="w-9 h-9 rounded-full bg-primary-soft text-primary font-bold text-[13px] flex items-center justify-center shrink-0">
                    {s.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-t1 truncate">{s.name}</span>
                      <Badge tone={ROLE_TONE[s.role] || "neutral"} className="capitalize">{s.role}</Badge>
                      {s.status === "inactive" && <Badge tone="danger">suspended</Badge>}
                      {s.userId === session?.user.id && <Badge tone="neutral">you</Badge>}
                    </div>
                    <div className="text-[11px] text-t3 truncate">
                      {s.branchName}{s.email ? ` · ${s.email}` : " · till-only (PIN)"}{s.hasPin ? "" : " · no PIN set"}
                    </div>
                  </div>
                  {s.role !== "owner" && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="secondary" onClick={() => setPinFor(s)}><KeyRound className="w-3.5 h-3.5" /> PIN</Button>
                      <Button size="sm" variant={s.status === "active" ? "secondary" : "success"} onClick={() => toggleStatus(s)}>
                        {s.status === "active" ? <><Ban className="w-3.5 h-3.5" /> Suspend</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Restore</>}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <AddStaff open={adding} branches={branchesForActive} isOwner={can("*")} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      <ResetPin staff={pinFor} onClose={() => setPinFor(null)} onSaved={() => { setPinFor(null); reload(); }} />
    </div>
  );
}

function AddStaff({ open, branches, isOwner, onClose, onSaved }: {
  open: boolean; branches: { id: string; name: string }[]; isOwner: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: "", role: "staff", branchId: "", pin: "", email: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/staff", {
        method: "POST",
        body: JSON.stringify({ ...form, branchId: form.branchId || undefined, email: form.email || undefined }),
      });
      setForm({ name: "", role: "staff", branchId: "", pin: "", email: "" });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a staff member" subtitle="They sign in at the till with the business code + this PIN">
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Full name"><Input autoFocus required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role">
            <Select value={form.role} onChange={(e) => set("role", e.target.value)}>
              <option value="staff">Staff — sells only</option>
              <option value="manager">Manager — runs a branch</option>
              {isOwner && <option value="admin">Admin — runs the business</option>}
            </Select>
          </Field>
          <Field label="Branch">
            <Select value={form.branchId} onChange={(e) => set("branchId", e.target.value)} required={form.role !== "admin"}>
              <option value="">{form.role === "admin" ? "All branches" : "Choose…"}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Till PIN" hint="4–6 digits, keep it secret">
            <Input required inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} placeholder="4321" />
          </Field>
          <Field label="Email" hint="Optional — for full logins">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding…" : "Add staff member"}</Button>
      </form>
    </Modal>
  );
}

function ResetPin({ staff, onClose, onSaved }: { staff: Staff | null; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(`/staff/${staff!.id}/pin`, { method: "POST", body: JSON.stringify({ pin }) });
      setPin("");
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!staff} onClose={onClose} title={`Reset PIN — ${staff?.name}`} subtitle="The old PIN stops working immediately. This is logged.">
      <form onSubmit={save} className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="New PIN">
          <Input autoFocus required inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Resetting…" : "Reset PIN"}</Button>
      </form>
    </Modal>
  );
}
