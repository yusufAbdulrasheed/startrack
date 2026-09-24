import { useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/EmptyState";
import { ErrorBanner, Input } from "@/components/ui/Field";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Turn = { question: string; answer: string };

const SUGGESTIONS = [
  "How did we do today compared to yesterday?",
  "What's our biggest risk right now?",
  "Which products are running low?",
];

/**
 * Stateless server-side by design — each question is answered fresh from
 * the business's real numbers (see ai.service.js's answerQuestion), so
 * there's nothing to persist here beyond this tab's own scroll history.
 */
export function AskAI() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [off, setOff] = useState(false);

  async function ask(q: string) {
    const clean = q.trim();
    if (!clean || busy) return;
    setBusy(true); setError(""); setQuestion("");
    try {
      const r = await api<{ enabled: boolean; ok?: boolean; answer?: string }>("/ai/chat", {
        method: "POST", body: JSON.stringify({ question: clean }),
      });
      if (!r.enabled) { setOff(true); return; }
      if (!r.ok || !r.answer) { setError("Couldn't get an answer just now — try again."); return; }
      setTurns((t) => [...t, { question: clean, answer: r.answer! }]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[760px] mx-auto flex flex-col h-full">
      <PageHeader title="Ask AI" subtitle="Answers grounded in this business's own numbers — never invented" />

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
                  <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-surface-2 border border-line text-[13px] text-t1 leading-relaxed whitespace-pre-line">{t.answer}</div>
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

          <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className={cn("flex items-center gap-2 sticky bottom-0 bg-canvas pt-2")}>
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your sales, stock, or trends…" className="flex-1" disabled={busy} />
            <Button type="submit" disabled={busy || !question.trim()}><Send className="w-4 h-4" /></Button>
          </form>
        </>
      )}
    </div>
  );
}
