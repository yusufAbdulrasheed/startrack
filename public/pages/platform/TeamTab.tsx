import { useState } from "react";
import { UserPlus, ShieldCheck, Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/EmptyState";
import { ErrorBanner, Input, Select } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Avatar, PageHeader, Panel, Pill } from "./ui";

type Member = { id: string; name: string; email: string; platformRole: string; status: string };

export function TeamTab({ selfEmail }: { selfEmail?: string }) {
  const { data, loading, reload } = useApi<{ staff: Member[] }>("/platform/staff", []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function grant(targetEmail: string, platformRole: string) {
    setBusy(true); setError("");
    try {
      await api("/platform/staff", { method: "POST", body: JSON.stringify({ email: targetEmail, platformRole }) });
      setEmail("");
      reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto animate-fade-up">
      <PageHeader title="Team" subtitle="The people who can sign in to this console." />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <Panel className="lg:col-span-3" title="StarTrack team" subtitle={data ? `${data.staff.length} with platform access` : undefined} flush>
          {loading || !data ? <div className="py-12"><Spinner /></div> : (
            <div className="divide-y divide-line border-t border-line">
              {data.staff.map((s) => (
                <div key={s.id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <Avatar name={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-t1 truncate">{s.name}{s.email === selfEmail && <span className="text-t4 font-medium"> · you</span>}</div>
                    <div className="text-[12px] text-t3 truncate">{s.email}</div>
                  </div>
                  <Pill tone={s.platformRole === "overseer" ? "brand" : "neutral"}>
                    {s.platformRole === "overseer" ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}{s.platformRole}
                  </Pill>
                  {s.email !== selfEmail && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => grant(s.email, "none")}>Remove</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-2" title="Give access" subtitle="They need an existing StarTrack login">
          <div className="space-y-3">
            <ErrorBanner message={error} />
            <label className="block text-[12px] font-semibold text-t3">Email
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" className="mt-1.5" />
            </label>
            <label className="block text-[12px] font-semibold text-t3">Access level
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1.5">
                <option value="support">Support — view only</option>
                <option value="overseer">Overseer — can change plans & suspend</option>
              </Select>
            </label>
            <Button className="w-full" onClick={() => grant(email, role)} disabled={busy || !email.trim()}>
              <UserPlus className="w-4 h-4" /> Grant access
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
