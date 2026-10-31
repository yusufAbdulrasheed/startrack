import { useState } from "react";
import { LogOut } from "lucide-react";
import { ApiError } from "@/lib/api";
import { Button, Card, Field, Notice, PasswordInput, TextInput } from "./bits";
import { useStore } from "./context";

export function AccountTab() {
  const { api, theme: t, shopper, setShopper, signOut, gate, toast } = useStore();
  const [p, setP] = useState({ name: shopper.name, phone: shopper.phone, address: shopper.address });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [err, setErr] = useState({ profile: "", password: "" });
  const [busy, setBusy] = useState<"" | "profile" | "password">("");

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profile"); setErr((x) => ({ ...x, profile: "" }));
    try { setShopper((await api.updateMe(p)).shopper); toast("Details saved."); } catch (x) { setErr((s) => ({ ...s, profile: (x as ApiError).message })); } finally { setBusy(""); }
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password"); setErr((x) => ({ ...x, password: "" }));
    try { await api.changePassword(pw); setPw({ currentPassword: "", newPassword: "" }); toast("Password changed."); } catch (x) { setErr((s) => ({ ...s, password: (x as ApiError).message })); } finally { setBusy(""); }
  }

  return (
    <div className="max-w-[640px] mx-auto px-4 lg:px-10 py-6 lg:py-10 pb-28 space-y-5">
      <div>
        <h1 className="text-[28px] lg:text-[34px] font-extrabold tracking-[-0.025em]">My account</h1>
        <p className="text-[14.5px] mt-1" style={{ color: t.muted }}>{shopper.email} · customer of {gate.name}</p>
      </div>

      <Card className="p-5 lg:p-6">
        <h2 className="text-[17px] font-extrabold">Your details</h2>
        <form onSubmit={saveProfile} className="mt-4 space-y-4">
          {err.profile && <Notice>{err.profile}</Notice>}
          <Field label="Name"><TextInput value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="name" /></Field>
          <Field label="Phone"><TextInput value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} type="tel" autoComplete="tel" /></Field>
          <Field label="Delivery address" hint="Pre-filled at checkout."><TextInput value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} autoComplete="street-address" /></Field>
          <Button type="submit" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save details"}</Button>
        </form>
      </Card>

      <Card className="p-5 lg:p-6">
        <h2 className="text-[17px] font-extrabold">Change password</h2>
        <form onSubmit={savePassword} className="mt-4 space-y-4">
          {err.password && <Notice>{err.password}</Notice>}
          <Field label="Current password"><PasswordInput value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
          <Field label="New password" hint="At least 8 characters."><PasswordInput value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" /></Field>
          <Button type="submit" kind="soft" disabled={busy === "password" || !pw.currentPassword || pw.newPassword.length < 8}>{busy === "password" ? "Updating…" : "Update password"}</Button>
        </form>
      </Card>

      <Button kind="ghost" full onClick={signOut}><LogOut className="w-4 h-4" /> Sign out</Button>
    </div>
  );
}
