import { useState } from "react";
import { Bot, Send, Sparkles, User, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/EmptyState";
import { ErrorBanner, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Proposal = { id: string; type: string; description: string; status: "pending" | "approved" | "rejected"; error?: string };
type Turn = { question: string; answer: string; proposals: Proposal[] };

const SUGGESTIONS = [
  "How did we do today compared to yesterday?",
  "What's our biggest risk right now?",
  "Which products are running low?",
];

/**
 * Stateless server-side for plain Q&A — each question is answered fresh
 * from the business's real numbers (see ai.service.js's answerQuestion).
 * The one thing that IS persisted is a proposed action: asking the AI to
 * DO something (create a customer, adjust stock, etc.) drafts a row in
 * AiAction, shown here with Approve/Reject — nothing happens until one of
 * those is clicked, and approving still re-checks the same permission the
 * equivalent manual screen would require.
 */
export function AskAI() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function ask(q: string) {
    const clean = q.trim();
    if (!clean || busy) return;
    setBusy(true); setError(""); setQuestion("");
    try {
      const r = await api<{ enabled: boolean; ok?: boolean; answer?: string; proposals?: { id: string; type: string; description: string }[] }>(
        "/ai/chat", { method: "POST", body: JSON.stringify({ question: clean }) }
      );
      if (!r.enabled) { setOff(true); return; }
      if (!r.ok || !r.answer) { setError("Couldn't get an answer just now — try again."); return; }
      const proposals: Proposal[] = (r.proposals || []).map((p) => ({ ...p, status: "pending" }));
      setTurns((t) => [...t, { question: clean, answer: r.answer!, proposals }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateProposal(id: string, patch: Partial<Proposal>) {
    setTurns((ts) => ts.map((t) => ({ ...t, proposals: t.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) })));
  }

  async function decide(id: string, action: "approve" | "reject") {
    setDecidingId(id);
    try {
      await api(`/ai/actions/${id}/${action}`, { method: "POST" });
      updateProposal(id, { status: action === "approve" ? "approved" : "rejected" });
    } catch (err: any) {
      updateProposal(id, { error: err.message });
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[760px] mx-auto flex flex-col h-full">
      <PageHeader title="Ask AI" subtitle="Answers grounded in this business's own numbers — actions always wait for your approval" />

      {off ? (
        <Card className="p-6 text-center">
          <Bot className="w-8 h-8 text-t4 mx-auto mb-2" />
          <div className="text-[13px] font-semibold text-t2">AI isn't set up on this server yet.</div>
        </Card>
      ) : (
        <>
          <ErrorBanner message={error} />

          <div className="flex-1 space-y-3 mb-4">
            {turns.length === 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-[13px] font-semibold text-t1">Try asking</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)} className="h-8 px-3 rounded-ctl border border-line-2 text-[12px] font-medium text-t2 hover:text-primary hover:border-brand-400 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-line text-[11.5px] text-t4">
                  You can also ask it to act — "create a customer named Grace, phone 0809…" or "add stock of 20 to Rice" — it'll draft the action here for you to approve first.
                </div>
              </Card>
            )}
            {turns.map((t, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start gap-2.5 justify-end">
                  <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm bg-primary text-white text-[13px] leading-relaxed">{t.question}</div>
                  <span className="w-7 h-7 shrink-0 rounded-full bg-surface-3 text-t3 flex items-center justify-center"><User className="w-3.5 h-3.5" /></span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-primary-soft text-primary flex items-center justify-center"><Bot className="w-3.5 h-3.5" /></span>
                  <div className="max-w-[80%] space-y-2">
                    <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2 border border-line text-[13px] text-t1 leading-relaxed whitespace-pre-line">{t.answer}</div>
                    {t.proposals.map((p) => (
                      <div key={p.id} className="px-3.5 py-3 rounded-ctl border border-line-2 bg-surface space-y-2">
                        <div className="text-[12.5px] text-t2">{p.description}</div>
                        {p.error && <div className="text-[11.5px] text-danger font-medium">{p.error}</div>}
                        {p.status === "pending" ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => decide(p.id, "approve")}
                              disabled={decidingId === p.id}
                              className="h-7 px-3 rounded-md bg-primary text-white text-[11.5px] font-semibold hover:brightness-110 disabled:opacity-60 flex items-center gap-1.5"
                            >
                              {decidingId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                            </button>
                            <button
                              onClick={() => decide(p.id, "reject")}
                              disabled={decidingId === p.id}
                              className="h-7 px-3 rounded-md border border-line-2 text-t3 text-[11.5px] font-semibold hover:text-danger hover:border-danger/40 disabled:opacity-60 flex items-center gap-1.5"
                            >
                              <X className="w-3 h-3" /> Reject
                            </button>
                          </div>
                        ) : p.status === "approved" ? (
                          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-success"><Check className="w-3.5 h-3.5" /> Done</div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-t4"><X className="w-3.5 h-3.5" /> Rejected</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-start gap-2.5">
                <span className="w-7 h-7 shrink-0 rounded-full bg-primary-soft text-primary flex items-center justify-center"><Bot className="w-3.5 h-3.5" /></span>
                <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2 border border-line text-[13px] text-t4">Thinking…</div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-1.5 mb-2 text-[10.5px] text-t4">
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
            Draft actions before you approve — double-check names, quantities and amounts, the same as you would with anything typed by a person.
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className={cn("flex items-center gap-2 sticky bottom-0 bg-canvas pt-2")}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question, or ask it to do something…" className="flex-1" disabled={busy} />
            <Button type="submit" disabled={busy || !question.trim()}><Send className="w-4 h-4" /></Button>
          </form>
        </>
      )}
    </div>
  );
}
