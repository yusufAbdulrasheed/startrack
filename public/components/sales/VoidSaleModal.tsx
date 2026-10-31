import { useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBanner, TextArea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";

/** Asks why, then voids the sale. Shared by Sales History and My Activity. */
export function VoidSaleModal({ sale, currency, onClose, onDone }: {
  sale: { id: string; saleNo: string; total: number } | null; currency: string; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(`/sales/${sale!.id}/void`, { method: "POST", body: JSON.stringify({ reason }) });
      setReason("");
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!sale}
      onClose={onClose}
      title={`Void ${sale?.saleNo}?`}
      subtitle={`${fmtMoney(sale?.total || 0, currency)} — stock returns to the shelf, the sale stays on record flagged as void`}
    >
      <form onSubmit={submit} className="space-y-3">
        <ErrorBanner message={error} />
        <TextArea autoFocus required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this sale being voided?" />
        <Button type="submit" variant="danger" className="w-full" disabled={busy}>
          <Ban className="w-4 h-4" /> {busy ? "Voiding…" : "Void this sale"}
        </Button>
      </form>
    </Modal>
  );
}
