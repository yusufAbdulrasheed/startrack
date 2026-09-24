import { useState } from "react";
import { Mail, MessageSquareText, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Channel = "email" | "sms";

/** One channel's send-code / enter-code mini-flow, inline in the banner. */
function ChannelRow({ channel, target, onVerified }: { channel: Channel; target: string; onVerified: () => void }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  async function send() {
    setBusy(true); setError("");
    try {
      await api("/verify/request", { method: "POST", body: JSON.stringify({ channel }) });
      setSent(true);
      setCooldown(60);
      const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true); setError("");
    try {
      await api("/verify/confirm", { method: "POST", body: JSON.stringify({ channel, code }) });
      onVerified();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = channel === "email" ? Mail : MessageSquareText;
  const label = channel === "email" ? "Email" : "Phone";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-t1 shrink-0">
        <Icon className="w-3.5 h-3.5" /> {label} <span className="text-t3 font-normal">({target})</span>
      </span>
      {!sent ? (
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="h-7 px-2.5 rounded-md bg-primary text-white text-[11px] font-semibold hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send code"}
        </button>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            className="h-7 w-24 px-2 rounded-md bg-surface border border-line text-[12px] font-mono text-t1 focus:outline-none focus:border-brand-500"
          />
          <button
            type="button"
            onClick={confirm}
            disabled={busy || code.length < 4}
            className="h-7 px-2.5 rounded-md bg-primary text-white text-[11px] font-semibold hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || cooldown > 0}
            className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
          </button>
        </>
      )}
      {error && <span className="text-[11px] text-danger font-medium w-full">{error}</span>}
    </div>
  );
}

/**
 * A dismissible-for-this-visit nag, not a gate — nothing else in the app
 * checks these flags to block a screen. Renders nothing once every
 * verifiable channel is verified (or there's no session yet).
 */
export function VerifyBanner() {
  const { session, refreshSession } = useSession();
  const [dismissed, setDismissed] = useState(false);

  if (!session || dismissed) return null;
  const needsEmail = !session.emailVerified && !!session.user.email;
  const needsPhone = !session.phoneVerified && !!session.user.phone;
  if (!needsEmail && !needsPhone) return null;

  return (
    <div className="shrink-0 bg-warning-soft border-b border-line px-4 py-2.5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-[12px] font-semibold text-t1">Verify your {needsEmail && needsPhone ? "email and phone" : needsEmail ? "email" : "phone"} to unlock every feature.</div>
          <div className={cn("flex flex-col gap-2", needsEmail && needsPhone && "sm:flex-row sm:gap-6")}>
            {needsEmail && <ChannelRow channel="email" target={session.user.email} onVerified={refreshSession} />}
            {needsPhone && <ChannelRow channel="sms" target={session.user.phone!} onVerified={refreshSession} />}
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-t3 hover:bg-black/5" title="Dismiss for now">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
