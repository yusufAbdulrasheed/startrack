import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ReceiptPaper, type ReceiptData } from "@/components/receipt/ReceiptPaper";

/**
 * What a customer opens from the WhatsApp message: their receipt, as printed at
 * the till. Public and read-only; the link itself is the key.
 */
export function ReceiptView() {
  const { token = "" } = useParams();
  const [data, setData] = useState<{ receipt: ReceiptData; voided: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ receipt: ReceiptData; voided: boolean }>(`/public/receipts/${token}`).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "This receipt isn't available."));
  }, [token]);

  if (error) return <div className="min-h-screen grid place-items-center bg-surface-2 p-6 text-center"><div><div className="text-[18px] font-semibold text-t1">Receipt not available</div><p className="text-[13px] text-t3 mt-1">{error} Check the link, or ask the shop to send it again.</p></div></div>;
  if (!data) return <div className="min-h-screen grid place-items-center bg-surface-2"><div className="w-6 h-6 rounded-full border-2 border-line border-t-primary animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-surface-2 py-6 px-4 print:bg-white print:p-0">
      <div className="max-w-sm mx-auto">
        {data.voided && <div className="mb-3 px-3 py-2.5 rounded-ctl bg-danger-soft text-danger text-[12.5px] font-semibold text-center print:hidden">This sale was voided by the shop.</div>}
        <div className="bg-white rounded-xl border border-line shadow-sm p-4 print-receipt" data-testid="public-receipt"><ReceiptPaper receipt={data.receipt} /></div>
        <button onClick={() => window.print()} className="print:hidden mt-3 w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-line-2 bg-surface text-[13px] font-semibold text-t1 hover:bg-surface-3"><Printer className="w-4 h-4" /> Print</button>
      </div>
    </div>
  );
}
