import { useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, Check, ClipboardCheck, Download, FileSpreadsheet, Info, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { ErrorBanner } from "@/components/ui/Field";
import { AiMark, AiText, TypingDots } from "@/components/ai/AiBits";
import { ReportCard, type ReportRef } from "@/components/ai/ReportCard";
import { ImportPreviewCard, type ImportPreview } from "@/components/ai/ImportPreviewCard";
import { api, apiDownload } from "@/lib/api";
import { useSession } from "@/lib/session";
import { typeMeta } from "@/lib/businessTypes";
import { cn } from "@/lib/utils";

export type Proposal = { id: string; type: string; description: string; status: "pending" | "approved" | "rejected"; error?: string };
export type AttachedFile = { name: string; size: number };
export type Turn = {
  question: string; answer: string; proposals: Proposal[];
  reports?: ReportRef[]; files?: AttachedFile[]; imports?: ImportPreview[];
};

type Reply = {
  enabled: boolean; ok?: boolean; answer?: string; reason?: string; chatId?: string;
  proposals?: { id: string; type: string; description: string }[];
  reports?: ReportRef[]; files?: AttachedFile[]; imports?: ImportPreview[];
};

const MAX_BYTES = 5 * 1024 * 1024;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Why a chosen file can't be used, before it is even sent.
function rejectFile(f: File): string {
  const ext = f.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
  if (ext === ".xls") return "That's an old .xls file. Open it in Excel and save it as .xlsx (or CSV), then attach it again.";
  if (![".xlsx", ".xlsm", ".csv"].includes(ext)) return "I can read Excel (.xlsx) and CSV (.csv) files.";
  if (f.size > MAX_BYTES) return "That file is over 5 MB — split it into smaller files.";
  return "";
}

/**
 * The conversation itself — shared by the Ask AI page and the per-screen
 * assistant drawer so a question, a follow-up, an attached spreadsheet and a
 * drafted action behave the same wherever they are asked.
 *
 * Stateless on the server: each question is answered fresh from live numbers,
 * with the last few turns sent along so follow-ups ("and last week?") make
 * sense. The things that persist are drafts — a proposed action or a prepared
 * import, saved as pending rows that do nothing until Approve is pressed, and
 * approval still re-checks the permission the equivalent manual action needs.
 */
export function AiChat({
  module, turns, onTurns, chatId, onSaved, suggestions, compact = false, placeholder, title,
}: {
  module: string;
  turns: Turn[];
  onTurns: (updater: (t: Turn[]) => Turn[]) => void;
  /** The saved conversation this belongs to; absent until the first answer is stored. */
  chatId?: string;
  /** Called with the chat's id each time a turn has been saved, so the history refreshes. */
  onSaved?: (chatId: string) => void;
  suggestions: string[];
  compact?: boolean;
  placeholder?: string;
  title?: string;
}) {
  const { can, activeBusiness, hasCapability, refreshData } = useSession();
  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false); // busy because a file is being read
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // What "my list" means for this trade, in the person's own words.
  const canImport = can("prices");
  const listNoun = hasCapability("programs") ? "courses" : hasCapability("appointments") ? "services" : hasCapability("memberships") ? "membership plans" : typeMeta(activeBusiness?.typeKey).products.toLowerCase();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns.length, busy]);

  function choose(f: File | undefined | null) {
    if (!f) return;
    const problem = rejectFile(f);
    if (problem) { setError(problem); return; }
    setError("");
    setFile(f);
    inputRef.current?.focus();
  }

  async function ask(q: string) {
    const clean = q.trim();
    if (busy) return;
    if (!file && clean.length < 3) return;
    if (!file && off) { setError("Answers aren't set up on this server yet — but you can still attach a spreadsheet and I'll add your list."); return; }
    const sending = file;
    setBusy(true); setReading(!!sending); setError(""); setQuestion(""); setFile(null);
    try {
      let r: Reply;
      if (sending) {
        const fd = new FormData();
        fd.append("file", sending);
        fd.append("question", clean);
        fd.append("module", module);
        if (chatId) fd.append("chatId", chatId);
        r = await api<Reply>("/ai/upload", { method: "POST", body: fd });
      } else {
        r = await api<Reply>("/ai/module", {
          method: "POST",
          body: JSON.stringify({
            module, question: clean, chatId,
            history: turns.slice(-4).map((t) => ({ q: t.question, a: t.answer.slice(0, 1800) })),
          }),
        });
      }
      if (!r.enabled) { setOff(true); return; }
      if (!r.ok || !r.answer) {
        setError(r.reason === "busy"
          ? "The AI is busy right now — please try again in a few seconds."
          : "Couldn't get an answer just now — try again.");
        return;
      }
      const proposals: Proposal[] = (r.proposals || []).map((p) => ({ ...p, status: "pending" }));
      onTurns((t) => [...t, {
        question: clean || (sending ? `Import ${sending.name}` : ""),
        answer: r.answer!, proposals,
        reports: r.reports || [],
        files: r.files || (sending ? [{ name: sending.name, size: sending.size }] : []),
        imports: r.imports || [],
      }]);
      if (r.chatId) onSaved?.(r.chatId);
    } catch (err: any) {
      setError(err.message);
      if (sending) setFile(sending); // let them try again without picking it twice
    } finally {
      setBusy(false); setReading(false);
      inputRef.current?.focus();
    }
  }

  const patch = (id: string, p: Partial<Proposal>) =>
    onTurns((ts) => ts.map((t) => ({ ...t, proposals: t.proposals.map((x) => (x.id === id ? { ...x, ...p } : x)) })));
  const patchImport = (id: string, p: Partial<ImportPreview>) =>
    onTurns((ts) => ts.map((t) => ({ ...t, imports: (t.imports || []).map((x) => (x.actionId === id ? { ...x, ...p } : x)) })));

  async function decide(id: string, action: "approve" | "reject") {
    setDecidingId(id);
    try {
      await api(`/ai/actions/${id}/${action}`, { method: "POST" });
      patch(id, { status: action === "approve" ? "approved" : "rejected", error: undefined });
      if (action === "approve") refreshData(); // the page behind the chat now shows stale numbers
    } catch (err: any) {
      patch(id, { error: err.message });
    } finally {
      setDecidingId(null);
    }
  }

  async function decideImport(id: string, action: "approve" | "reject") {
    setDecidingId(id);
    try {
      const r = await api<{ action?: { resultRef?: { label?: string } } }>(`/ai/actions/${id}/${action}`, { method: "POST" });
      patchImport(id, { status: action === "approve" ? "approved" : "rejected", result: r.action?.resultRef?.label, error: undefined });
      if (action === "approve") refreshData();
    } catch (err: any) {
      patchImport(id, { error: err.message });
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div
      className="relative flex flex-col h-full min-h-0"
      onDragEnter={(e) => { if (canImport && e.dataTransfer?.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragOver={(e) => { if (canImport && e.dataTransfer?.types.includes("Files")) e.preventDefault(); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { if (!canImport) return; e.preventDefault(); setDragging(false); choose(e.dataTransfer.files?.[0]); }}
    >
      {dragging && (
        <div className="absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-primary bg-primary-soft/90 grid place-items-center text-center pointer-events-none">
          <div>
            <FileSpreadsheet className="w-8 h-8 text-primary mx-auto" />
            <div className="mt-2 text-[14px] font-bold text-primary">Drop your spreadsheet</div>
            <div className="text-[12.5px] text-t2">Excel or CSV — I'll read it and show what it would add</div>
          </div>
        </div>
      )}

      <div className={cn("flex-1 overflow-y-auto", compact ? "px-5 py-5" : "px-1 py-1")}>
        <ErrorBanner message={error} />
        {off && turns.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-surface-3 px-3 py-2 text-[12px] text-t2"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-t3" />Answers aren't set up on this server (no GROQ_API_KEY). You can still attach a spreadsheet.</div>
        )}

        {turns.length === 0 && (
          <div className={cn("flex flex-col items-center text-center", compact ? "pt-6" : "pt-10")}>
            <AiMark size={52} />
            <h2 className="mt-4 text-[18px] font-bold text-t1 tracking-[-0.02em]">{title || "How can I help?"}</h2>
            <p className="mt-1.5 max-w-[34ch] text-[13px] text-t3 leading-relaxed">
              Ask about the numbers on this screen, or ask me to draft something for you to approve.
            </p>
            {off && (
              <div className="mt-4 flex items-start gap-2 text-left rounded-xl bg-surface-3 px-3 py-2 text-[12px] text-t2 max-w-[44ch]"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-t3" />Answers aren't set up on this server (add a GROQ_API_KEY). Spreadsheet imports still work.</div>
            )}

            {canImport && (
              <div className="mt-6 w-full rounded-2xl border border-dashed border-line-2 bg-surface px-4 py-3.5 text-left flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-success-soft text-success shrink-0"><FileSpreadsheet className="w-5 h-5" strokeWidth={1.8} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-t1">Have your {listNoun} in a spreadsheet?</div>
                  <div className="text-[12px] text-t3 leading-snug">Attach it and I'll add them all — anything you already have is skipped.</div>
                </div>
                <button
                  onClick={() => apiDownload("/ai/import-template", "import-template.xlsx").catch((e) => setError(e.message))}
                  className="shrink-0 h-8 px-2.5 rounded-lg border border-line-2 bg-surface text-[12px] font-bold text-t2 hover:text-primary hover:border-primary flex items-center gap-1.5 transition-colors"
                  title="A ready-to-fill Excel file with the right columns for your business"
                >
                  <Download className="w-3.5 h-3.5" /> Template
                </button>
              </div>
            )}

            <div className={cn("mt-4 w-full grid gap-2 text-left", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="group flex items-center gap-3 px-4 py-3 text-left rounded-2xl border border-line bg-surface text-[13px] font-medium text-t2 hover:border-primary hover:bg-primary-softer hover:text-t1 transition-colors"
                >
                  <span className="flex-1 min-w-0">{s}</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0 text-t4 group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-start gap-2 text-left text-[12px] text-t3 leading-relaxed max-w-[44ch]">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-t4" />
              <span>I can also act — “create a customer named Grace” or “log a fuel expense of 5,000” — but I only draft it here for you to approve first.</span>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {turns.map((t, i) => (
            <div key={i} className="space-y-3 animate-fade-up">
              {/* You */}
              <div className="flex flex-col items-end gap-1.5">
                {(t.files || []).map((f) => (
                  <div key={f.name} className="max-w-[86%] flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-2xl border border-line bg-surface shadow-e1">
                    <span className="grid place-items-center w-8 h-8 rounded-lg bg-success-soft text-success shrink-0"><FileSpreadsheet className="w-4 h-4" /></span>
                    <span className="min-w-0 text-left">
                      <span className="block text-[12.5px] font-bold text-t1 truncate">{f.name}</span>
                      <span className="block text-[11px] text-t3">{kb(f.size)}</span>
                    </span>
                  </div>
                ))}
                {(!t.files?.length || (t.question && !t.question.startsWith("Import "))) && (
                  <div
                    className="max-w-[86%] px-4 py-2.5 rounded-[20px] rounded-br-md text-[13.5px] leading-relaxed text-white"
                    style={{ background: "var(--st-gradient-primary)", boxShadow: "0 10px 20px -12px rgba(59, 63, 245, 0.6)" }}
                  >
                    {t.question}
                  </div>
                )}
              </div>

              {/* The AI */}
              <div className="flex items-start gap-3">
                <AiMark size={28} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="px-4 py-3.5 rounded-[20px] rounded-tl-md bg-surface border border-line shadow-e1">
                    <AiText text={t.answer} />
                  </div>

                  {(t.imports || []).map((imp) => (
                    <ImportPreviewCard
                      key={imp.actionId || `${imp.fileName}-${imp.target}`}
                      preview={imp}
                      busy={!!imp.actionId && decidingId === imp.actionId}
                      onDecide={(a) => imp.actionId && decideImport(imp.actionId, a)}
                    />
                  ))}

                  {(t.reports || []).map((rep) => (
                    <ReportCard key={`${rep.kind}-${rep.days}`} report={rep} />
                  ))}

                  {t.proposals.map((p) => (
                    <div key={p.id} className={cn("rounded-2xl border p-4", p.type === "archive_products" ? "border-danger/30 bg-danger-soft" : "border-primary/25 bg-primary-softer")}>
                      <div className={cn("flex items-center gap-1.5 text-[11.5px] font-bold", p.type === "archive_products" ? "text-danger" : "text-primary")}>
                        {p.type === "archive_products" ? <Trash2 className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                        {p.type === "archive_products" ? "Proposed deletion — nothing is removed until you approve" : "Proposed action"}
                      </div>
                      <div className="mt-1.5 text-[13px] leading-relaxed text-t1">{p.description}</div>
                      {p.error && <div className="mt-2 text-[12px] text-danger font-semibold">{p.error}</div>}
                      <div className="mt-3">
                        {p.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => decide(p.id, "approve")}
                              disabled={decidingId === p.id}
                              className={cn("text-white h-9 px-4 rounded-xl text-[12.5px] font-bold flex items-center gap-1.5 disabled:opacity-60", p.type === "archive_products" ? "bg-danger" : "bg-primary")}
                            >
                              {decidingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : p.type === "archive_products" ? <Trash2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />} {p.type === "archive_products" ? "Delete" : "Approve"}
                            </button>
                            <button
                              onClick={() => decide(p.id, "reject")}
                              disabled={decidingId === p.id}
                              className="h-9 px-4 rounded-xl border border-line-2 bg-surface text-t2 text-[12.5px] font-bold hover:text-danger hover:border-danger/50 disabled:opacity-60 flex items-center gap-1.5 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        ) : p.status === "approved" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success-soft text-success text-[12px] font-bold"><Check className="w-3.5 h-3.5" /> Done</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-3 text-t3 text-[12px] font-bold"><X className="w-3.5 h-3.5" /> Rejected</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-start gap-3">
              <AiMark size={28} className="mt-0.5" />
              <div className="px-4 py-3.5 rounded-[20px] rounded-tl-md bg-surface border border-line shadow-e1 flex items-center gap-2.5">
                <TypingDots />
                {reading && <span className="text-[12px] text-t3">Reading your spreadsheet…</span>}
              </div>
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className={cn("shrink-0", compact ? "px-4 pb-4 pt-2" : "pt-3")}>
        <form
          onSubmit={(e) => { e.preventDefault(); ask(question); }}
          className="rounded-[22px] border border-line-2 bg-surface focus-within:border-primary focus-within:shadow-[var(--st-focus-ring)] transition-[border-color,box-shadow]"
        >
          {file && (
            <div className="px-3 pt-3">
              <div className="inline-flex items-center gap-2.5 max-w-full pl-2 pr-1.5 py-1.5 rounded-xl bg-surface-3">
                <span className="grid place-items-center w-8 h-8 rounded-lg bg-success-soft text-success shrink-0"><FileSpreadsheet className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-t1 truncate max-w-[220px]">{file.name}</span>
                  <span className="block text-[11px] text-t3">{kb(file.size)} · ready to read</span>
                </span>
                <button type="button" onClick={() => setFile(null)} aria-label="Remove the file" className="w-7 h-7 rounded-lg text-t3 hover:bg-surface hover:text-danger grid place-items-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-1.5 p-2 pl-2">
            {canImport && (
              <>
                <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-label="Attach a spreadsheet"
                  title="Attach an Excel or CSV file"
                  className="w-9 h-9 rounded-full text-t3 hover:bg-surface-3 hover:text-primary grid place-items-center shrink-0 disabled:opacity-40 transition-colors"
                >
                  <Paperclip className="w-[18px] h-[18px]" />
                </button>
              </>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
              placeholder={file ? "Anything I should know? (optional)" : placeholder || "Ask a question, or ask me to do something…"}
              disabled={busy}
              maxLength={500}
              className={cn("flex-1 resize-none bg-transparent py-2 text-[13.5px] text-t1 placeholder:text-t4 outline-none max-h-28 leading-relaxed disabled:opacity-60", !canImport && "pl-2")}
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={busy || (!file && question.trim().length < 3)}
              className="bg-primary text-white grid place-items-center w-9 h-9 rounded-full shrink-0 disabled:opacity-40"
            >
              <ArrowUp className="w-[18px] h-[18px]" strokeWidth={2.4} />
            </button>
          </div>
        </form>
        <div className="mt-2 text-center text-[11px] text-t4">
          Check names, quantities and amounts before approving a draft.
        </div>
      </div>
    </div>
  );
}
