import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, KeyRound, LogOut, Menu, Store, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { ErrorBanner, Field, Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

// Staff change their own till PIN — requires the current one when set.
function ChangePinModal({ open, onClose, businessId }: { open: boolean; onClose: () => void; businessId: string }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/auth/change-pin", { method: "POST", body: JSON.stringify({ businessId, currentPin, newPin }) });
      setDone(true);
      setCurrentPin(""); setNewPin("");
      setTimeout(() => { setDone(false); onClose(); }, 1200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change my PIN" subtitle="Your till login PIN for this business">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        {done && <div className="px-3 py-2.5 rounded-ctl bg-success-soft text-success text-[12px] font-semibold">PIN changed.</div>}
        <Field label="Current PIN" hint="Leave blank if you've never had one">
          <Input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="New PIN">
          <Input required type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Changing…" : "Change PIN"}</Button>
      </form>
    </Modal>
  );
}

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const navigate = useNavigate();
  const { session, activeBusiness, activeBranch, branchesForActive, setActiveBusiness, setActiveBranch, logout } = useSession();
  const [branchOpen, setBranchOpen] = useState(false);
  const [bizOpen, setBizOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setBranchOpen(false); setBizOpen(false); setUserOpen(false); } };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!session) return null;
  const multiBiz = session.businesses.length > 1;

  return (
    <header ref={ref} className="h-16 shrink-0 bg-surface border-b border-line flex items-center gap-3 px-4">
      {/* Wordmark — the sidebar carries the mark, this carries the name. */}
      <span className="hidden lg:block font-display font-bold text-[15px] tracking-tight text-t1 mr-1">StarTrack</span>
      {/* Mobile menu button */}
      <button
        onClick={onMenu}
        className="lg:hidden w-9 h-9 shrink-0 rounded-lg border border-line flex items-center justify-center text-t2 hover:bg-surface-3"
        title="Menu"
      >
        <Menu className="w-[18px] h-[18px]" />
      </button>

      {/* Business (shows only if 2+) → Branch switcher */}
      <div className="flex items-center gap-2">
        {multiBiz ? (
          <div className="relative">
            <button onClick={() => { setBizOpen((v) => !v); setBranchOpen(false); setUserOpen(false); }} className="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-2 border border-line text-[13px] font-semibold text-t1 hover:bg-surface-3">
              <Store className="w-4 h-4 text-primary" /> <span className="max-sm:hidden">{activeBusiness?.name}</span> <ChevronDown className="w-3.5 h-3.5 text-t3" />
            </button>
            {bizOpen && (
              <div className="absolute top-full mt-1 left-0 w-52 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-t4">My Businesses</div>
                {session.businesses.map((b) => (
                  <button key={b.id} onClick={() => { setActiveBusiness(b.id); setBizOpen(false); }} className={cn("w-full flex items-center gap-2 text-left px-3 py-2 text-[13px] hover:bg-surface-3", b.id === activeBusiness?.id ? "text-primary font-semibold" : "text-t2")}>
                    <Building2 className="w-3.5 h-3.5" /> {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-sm:hidden flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-2 border border-line text-[13px] font-semibold text-t1">
            <Store className="w-4 h-4 text-primary" /> {activeBusiness?.name}
          </div>
        )}

        {branchesForActive.length > 0 && (
          <div className="relative">
            <button onClick={() => { setBranchOpen((v) => !v); setBizOpen(false); setUserOpen(false); }} className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-line-2 text-[13px] font-medium text-t2 hover:bg-surface-3">
              {activeBranch?.name} <ChevronDown className="w-3.5 h-3.5 text-t3" />
            </button>
            {branchOpen && (
              <div className="absolute top-full mt-1 left-0 w-44 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
                {branchesForActive.map((b) => (
                  <button key={b.id} onClick={() => { setActiveBranch(b.id); setBranchOpen(false); }} className={cn("w-full text-left px-3 py-2 text-[13px] hover:bg-surface-3", b.id === activeBranch?.id ? "text-primary font-semibold" : "text-t2")}>{b.name}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <GlobalSearch />

      <div className="flex items-center gap-1.5 ml-auto">
        <span data-tour="topbar-notifications">
          <NotificationBell />
        </span>
        <ThemeToggle />

        {/* User menu */}
        <div className="relative">
          <button onClick={() => { setUserOpen((v) => !v); setBizOpen(false); setBranchOpen(false); }} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-surface-3 transition-colors">
            <span className="w-7 h-7 rounded-lg bg-primary-soft text-primary font-bold text-[13px] flex items-center justify-center">{session.user.name[0]?.toUpperCase()}</span>
            <ChevronDown className="w-3.5 h-3.5 text-t3" />
          </button>
          {userOpen && (
            <div className="absolute top-full mt-1 right-0 w-52 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
              <div className="px-3 py-2.5 border-b border-line">
                <div className="text-[13px] font-semibold text-t1 truncate">{session.user.name}</div>
                <div className="text-[11px] text-t3 truncate">{session.user.email}</div>
                <div className="mt-1 inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-soft text-primary capitalize">{session.role}</div>
              </div>
              <button onClick={() => { setUserOpen(false); setPinOpen(true); }} className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-[13px] text-t2 hover:bg-surface-3">
                <KeyRound className="w-4 h-4" /> Change my PIN
              </button>
              <button onClick={() => { logout(); navigate("/login"); }} className="w-full flex items-center gap-2 text-left px-3 py-2.5 text-[13px] text-danger hover:bg-danger-soft">
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} businessId={activeBusiness?.id || ""} />
    </header>
  );
}
