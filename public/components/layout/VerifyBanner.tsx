import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Check, Mail, MessageSquareText } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

type Channel = "email" | "sms";

/** One channel's send-code / enter-code mini-flow. */
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
    <div className="rounded-xl border border-line bg-surface-2 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2 text-[13px] font-bold text-t1 min-w-0">
        <Icon className="w-4 h-4 text-primary shrink-0" /> {label} <span className="text-t3 font-normal truncate">({target})</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
      {!sent ? (
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="h-9 px-3.5 rounded-lg bg-primary text-white text-[12.5px] font-bold disabled:opacity-60"
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
            className="h-9 w-32 px-3 rounded-lg bg-surface border border-line-2 text-[13px] font-mono text-t1 focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={confirm}
            disabled={busy || code.length < 4}
            className="h-9 px-3.5 rounded-lg bg-primary text-white text-[12.5px] font-bold disabled:opacity-60"
          >
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || cooldown > 0}
            className="text-[12px] font-semibold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend"}
          </button>
        </>
      )}
      </div>
      {error && <div className="text-[12px] text-danger font-medium">{error}</div>}
    </div>
  );
}

/**
 * Asks once per browser session (not on every page) to verify email/phone, in a
 * dialog rather than a bar across the top of every screen. It's a nudge, not a
 * gate: "Maybe later" closes it, and nothing else in the app is blocked.
 * Renders nothing once every verifiable channel is verified.
 */
const SEEN_KEY = "st-verify-prompt-seen";
const seen = () => { try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode: it just asks again next load */ } };

export function VerifyBanner() {
  const { session, refreshSession } = useSession();
  const [dismissed, setDismissed] = useState(seen);

  if (!session || dismissed) return null;
  const needsEmail = !session.emailVerified && !!session.user.email;
  const needsPhone = !session.phoneVerified && !!session.user.phone;
  if (!needsEmail && !needsPhone) return null;

  const close = () => { markSeen(); setDismissed(true); };
  const what = needsEmail && needsPhone ? "email and phone" : needsEmail ? "email" : "phone";

  return (
    <Modal open onClose={close} title={`Verify your ${what}`} subtitle="Unlocks every feature and lets us reach you about your account.">
      <div className="space-y-3">
        {needsEmail && <ChannelRow channel="email" target={session.user.email} onVerified={refreshSession} />}
        {needsPhone && <ChannelRow channel="sms" target={session.user.phone!} onVerified={refreshSession} />}
        <div className="flex items-center justify-between pt-1">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-t3"><Check className="w-3.5 h-3.5" /> Takes under a minute</span>
          <button type="button" onClick={close} className="h-9 px-4 rounded-xl border border-line-2 bg-surface text-t2 text-[12.5px] font-bold hover:text-t1">Maybe later</button>
        </div>
      </div>
    </Modal>
  );
}
