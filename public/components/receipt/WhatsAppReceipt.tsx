import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { api } from "@/lib/api";

/**
 * "Send this receipt on WhatsApp": asks the server for the customer's receipt
 * link, then opens WhatsApp with the message ready. Used by the till and by
 * Sales History, so a receipt can be sent right away or any time later. If we
 * don't know the customer's number, the cashier can type it (or pick the
 * contact inside WhatsApp).
 */
export function WhatsAppReceipt({ saleId, phone: known = "", className }: { saleId: string; phone?: string; className?: string }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true); setError("");
    // Opened first, filled in once the link is back, so the browser sees a click and doesn't block it as a popup.
    const tab = window.open("", "_blank");
    try {
      const r = await api<{ whatsappUrl: string }>(`/sales/${saleId}/receipt${phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : ""}`);
      if (tab) tab.location.href = r.whatsappUrl; else window.location.href = r.whatsappUrl;
    } catch (e: any) {
      tab?.close();
      setError(e.message || "Couldn't prepare the receipt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        {!known && <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Customer's WhatsApp number (optional)" aria-label="Customer's WhatsApp number" inputMode="tel" />}
        <Button variant="secondary" onClick={send} disabled={busy} title={known ? `Send to ${known}` : "Opens WhatsApp with the receipt link ready"} className="shrink-0">
          <MessageCircle className="w-4 h-4" /> {busy ? "Preparing…" : "WhatsApp receipt"}
        </Button>
      </div>
      {error && <div className="text-[12px] text-danger mt-1.5">{error}</div>}
    </div>
  );
}
