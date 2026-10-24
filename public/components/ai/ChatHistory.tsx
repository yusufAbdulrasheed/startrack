import { useMemo, useState } from "react";
import { Check, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { AiMark } from "@/components/ai/AiBits";
import type { Turn } from "@/components/ai/AiChat";
import { Spinner } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { moduleLabel } from "@/lib/aiPrompts";
import { cn } from "@/lib/utils";

export type ChatSummary = { id: string; module: string; title: string; turns: number; preview: string; updatedAt: string };
export type OpenedChat = { id: string; module: string; turns: Turn[] };

// "Just now", "12m ago", "3:20 PM", "Tue", "14 Oct".
function when(iso: string) {
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "Just now";
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
  if (mins < 60 * 24 * 6) return d.toLocaleDateString("en-NG", { weekday: "short" });
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function bucket(iso: string) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Older";
}
const ORDER = ["Today", "Yesterday", "Previous 7 days", "Older"];

/**
 * Every conversation the signed-in person has had in this business, newest
 * first. Saved on the server as each answer arrives — nothing to press.
 * `version` goes up whenever a turn is saved so the list refreshes itself.
 */
export function ChatHistory({
  activeId, version, onOpen, onNew, onDeleted,
}: {
  activeId?: string;
  version: number;
  onOpen: (chat: OpenedChat) => void;
  onNew: () => void;
  onDeleted: (id: string | "all") => void;
}) {
  const { data, loading, reload } = useApi<{ chats: ChatSummary[] }>("/ai/chats", [version]);
  const [q, setQ] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null); // a chat id, or "all"
  const [error, setError] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (data?.chats || []).filter((c) => !needle || c.title.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle));
    const by = new Map<string, ChatSummary[]>();
    for (const c of rows) by.set(bucket(c.updatedAt), [...(by.get(bucket(c.updatedAt)) || []), c]);
    return ORDER.filter((g) => by.has(g)).map((g) => ({ label: g, chats: by.get(g)! }));
  }, [data, q]);

  const total = data?.chats.length ?? 0;

  async function open(c: ChatSummary) {
    setOpening(c.id); setError("");
    try {
      const r = await api<{ chat: { id: string; module: string; turns: Turn[] } }>(`/ai/chats/${c.id}`);
      onOpen({ id: r.chat.id, module: r.chat.module, turns: r.chat.turns });
    } catch (err: any) {
      setError(err.message || "Couldn't open that chat.");
    } finally {
      setOpening(null);
    }
  }

  async function remove(id: string | "all") {
    setError("");
    try {
      await api(id === "all" ? "/ai/chats" : `/ai/chats/${id}`, { method: "DELETE" });
      setConfirming(null);
      onDeleted(id);
      reload();
    } catch (err: any) {
      setError(err.message || "Couldn't delete that.");
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="shrink-0 p-4 space-y-3">
        <button onClick={onNew} className="bg-primary text-white w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5">
          <Plus className="w-4 h-4" /> New chat
        </button>
        {total > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-t3 pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your chats"
              className="w-full h-10 pl-10 pr-3 rounded-xl bg-surface-3 border border-transparent text-[13px] text-t1 placeholder:text-t3 outline-none focus:border-primary focus:bg-surface focus:shadow-[var(--st-focus-ring)] transition-[border-color,box-shadow,background-color]"
            />
          </div>
        )}
        {error && <div className="px-3 py-2 rounded-xl bg-danger-soft text-danger text-[12.5px] font-medium">{error}</div>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {loading && !data ? (
          <Spinner />
        ) : total === 0 ? (
          <div className="h-full grid place-items-center px-6 text-center">
            <div>
              <AiMark size={44} className="mx-auto opacity-80" />
              <div className="mt-4 text-[14px] font-bold text-t1">No chats yet</div>
              <p className="mt-1 text-[12.5px] text-t3 leading-relaxed">Everything you ask is saved here automatically, so you can pick a conversation back up later.</p>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-t3">No chats match “{q}”.</div>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="px-2 py-1.5 text-[11.5px] font-bold text-t3">{g.label}</div>
              <ul className="space-y-0.5">
                {g.chats.map((c) => {
                  const active = c.id === activeId;
                  const asking = confirming === c.id;
                  return (
                    <li key={c.id}>
                      <div
                        className={cn(
                          "group relative flex items-center gap-2 rounded-xl px-3 py-2.5 transition-colors",
                          active ? "bg-primary-soft" : "hover:bg-surface-3"
                        )}
                      >
                        <button onClick={() => open(c)} className="min-w-0 flex-1 text-left" disabled={opening === c.id}>
                          <div className={cn("text-[13px] font-semibold truncate", active ? "text-primary" : "text-t1")}>{c.title}</div>
                          <div className="mt-0.5 text-[11.5px] text-t3 truncate">
                            {moduleLabel(c.module)} · {c.turns} {c.turns === 1 ? "message" : "messages"} · {when(c.updatedAt)}
                          </div>
                        </button>
                        {opening === c.id && <Loader2 className="w-4 h-4 animate-spin text-t3 shrink-0" />}
                        {asking ? (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => remove(c.id)} aria-label="Confirm delete" className="h-7 px-2.5 rounded-lg bg-danger text-white text-[11.5px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Delete
                            </button>
                            <button onClick={() => setConfirming(null)} aria-label="Cancel" className="w-7 h-7 rounded-lg text-t3 hover:bg-surface-3 grid place-items-center">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirming(c.id)}
                            aria-label={`Delete “${c.title}”`}
                            className="w-7 h-7 rounded-lg text-t4 hover:text-danger hover:bg-danger-soft grid place-items-center shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {total > 0 && (
        <div className="shrink-0 border-t border-line px-4 py-3">
          {confirming === "all" ? (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-t2 flex-1">Delete all {total} chats?</span>
              <button onClick={() => remove("all")} className="h-8 px-3 rounded-lg bg-danger text-white text-[12px] font-bold">Delete all</button>
              <button onClick={() => setConfirming(null)} className="h-8 px-3 rounded-lg border border-line-2 text-t2 text-[12px] font-bold">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirming("all")} className="text-[12.5px] font-semibold text-t3 hover:text-danger transition-colors">Clear all history</button>
          )}
        </div>
      )}
    </div>
  );
}
