import { useState } from "react";
import { Check, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { apiDownload } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ReportRef = { kind: string; title: string; days: number | null; blurb?: string };
type Format = "pdf" | "xlsx";

/**
 * A report the AI has offered. Nothing is generated until a button is pressed;
 * then the server builds the file from the live numbers and the browser saves
 * it. Opening an old chat and pressing the button again gives today's figures.
 */
export function ReportCard({ report }: { report: ReportRef }) {
  const [busy, setBusy] = useState<Format | null>(null);
  const [done, setDone] = useState<Format | null>(null);
  const [error, setError] = useState("");

  async function download(format: Format) {
    setBusy(format); setError(""); setDone(null);
    try {
      const qs = new URLSearchParams({ format, ...(report.days ? { days: String(report.days) } : {}) });
      await apiDownload(`/reports/${report.kind}?${qs}`, `${report.kind}.${format}`);
      setDone(format);
      setTimeout(() => setDone((d) => (d === format ? null : d)), 3500);
    } catch (err: any) {
      setError(err.message || "Couldn't build that report.");
    } finally {
      setBusy(null);
    }
  }

  const btn = "h-9 px-3.5 rounded-xl text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-60 transition-colors";

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-e1 overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        <span
          className="grid place-items-center w-11 h-11 rounded-xl text-white shrink-0"
          style={{ background: "var(--st-gradient-primary)", boxShadow: "0 10px 18px -10px rgba(59, 63, 245, 0.7)" }}
        >
          <FileText className="w-5 h-5" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-bold text-primary">Report ready</div>
          <div className="text-[13.5px] font-bold text-t1 truncate">{report.title}</div>
          <div className="text-[12px] text-t3 truncate">{report.blurb || "Built from your live numbers"}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3.5 pb-3.5">
        <button onClick={() => download("pdf")} disabled={!!busy} className={cn(btn, "bg-primary text-white")}>
          {busy === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done === "pdf" ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          {done === "pdf" ? "Saved" : "PDF"}
        </button>
        <button
          onClick={() => download("xlsx")}
          disabled={!!busy}
          className={cn(btn, "border border-line-2 bg-surface text-t1 hover:border-success hover:text-success")}
        >
          {busy === "xlsx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done === "xlsx" ? <Check className="w-3.5 h-3.5 text-success" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          {done === "xlsx" ? "Saved" : "Excel"}
        </button>
        {busy && <span className="text-[12px] text-t3">Building your {busy === "pdf" ? "PDF" : "spreadsheet"}…</span>}
      </div>
      {error && <div className="px-3.5 pb-3.5 -mt-1 text-[12px] text-danger font-semibold">{error}</div>}
    </div>
  );
}
