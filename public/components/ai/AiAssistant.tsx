import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { History, SquarePen, X } from "lucide-react";
import { AiChat, type Turn } from "@/components/ai/AiChat";
import { AiMark } from "@/components/ai/AiBits";
import { ChatHistory, type OpenedChat } from "@/components/ai/ChatHistory";
import { useSession } from "@/lib/session";
import { moduleFromPath, moduleLabel, suggestionsFor } from "@/lib/aiPrompts";
import { typeMeta } from "@/lib/businessTypes";
import { cn } from "@/lib/utils";

// Screens where the assistant would be redundant or out of place.
const HIDDEN_ON = new Set(["ask-ai", "platform"]);

// One conversation: its saved id (once the first answer is stored), the screen
// it belongs to, and what has been said.
type Session = { id?: string; module: string; turns: Turn[] };

/**
 * The AI that travels with you. One button in the top bar; it reads the route
 * to know which screen you're on and sends that to the server, which attaches
 * that screen's live data and the business's trade knowledge (see
 * server/modules/ai/domain/). Ask on the Front Desk and it talks occupancy and
 * folios; ask in the Academy and it talks fees and seats.
 *
 * Every answer is saved on the server as it arrives, so the History view can
 * bring any past conversation back. While the app stays open, hopping between
 * pages keeps each screen's current chat where you left it.
 */
export function AiAssistant() {
  const { pathname } = useLocation();
  const { activeBusiness, session } = useSession();
  const module = moduleFromPath(pathname);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [byModule, setByModule] = useState<Record<string, Session>>({});
  const [opened, setOpened] = useState<Session | null>(null); // a chat picked from History
  const [version, setVersion] = useState(0); // bumps whenever a turn is saved

  // A different business is a different set of conversations entirely.
  const scope = `${activeBusiness?.id}`;
  useEffect(() => { setByModule({}); setOpened(null); setView("chat"); }, [scope]);
  useEffect(() => { setOpen(false); setOpened(null); setView("chat"); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (!session || HIDDEN_ON.has(module)) return null;

  const current: Session = opened ?? byModule[module] ?? { module, turns: [] };
  const update = (fn: (s: Session) => Session) =>
    opened ? setOpened((s) => fn(s!)) : setByModule((m) => ({ ...m, [module]: fn(m[module] ?? { module, turns: [] }) }));

  const label = moduleLabel(current.module);
  const trade = typeMeta(activeBusiness?.typeKey).label;

  function newChat() {
    setOpened(null);
    setByModule((m) => ({ ...m, [module]: { module, turns: [] } }));
    setView("chat");
  }
  function openFromHistory(c: OpenedChat) {
    setOpened({ id: c.id, module: c.module, turns: c.turns });
    setView("chat");
  }
  function afterDelete(id: string | "all") {
    // If the chat on screen was just deleted, start fresh rather than keep
    // talking into a conversation that no longer exists.
    if (id === "all" || id === current.id) newChat();
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "h-10 pl-1.5 pr-3.5 rounded-full border text-[13px] font-bold flex items-center gap-2 transition-colors",
          open ? "bg-primary-soft border-primary text-primary" : "border-line-2 bg-surface text-t1 hover:bg-primary-softer hover:border-primary"
        )}
        title={`Ask AI about ${moduleLabel(module)}`}
        aria-expanded={open}
      >
        <AiMark size={28} />
        <span className="max-sm:hidden">Ask AI</span>
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[90]" role="dialog" aria-label="AI assistant">
          <div className="absolute inset-0 bg-ink/35 lg:bg-ink/15" onClick={() => setOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-canvas sm:rounded-l-[28px] shadow-e2 flex flex-col animate-fade-in overflow-hidden">
            <div className="shrink-0 px-5 py-4 bg-surface border-b border-line flex items-center gap-3">
              <AiMark size={38} />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-t1 truncate tracking-[-0.01em]">
                  {view === "history" ? "Chat history" : `${label} assistant`}
                </div>
                <div className="text-[12px] text-t3 truncate">
                  {view === "history" ? "Saved automatically" : `Knows your ${trade.toLowerCase()} and this screen's live numbers`}
                </div>
              </div>
              <button
                onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
                aria-label="Chat history"
                title="Chat history"
                aria-pressed={view === "history"}
                className={cn("w-9 h-9 rounded-full grid place-items-center transition-colors", view === "history" ? "bg-primary-soft text-primary" : "text-t3 hover:bg-surface-3 hover:text-t1")}
              >
                <History className="w-4 h-4" />
              </button>
              <button onClick={newChat} aria-label="Start a new chat" title="New chat" className="w-9 h-9 rounded-full text-t3 hover:bg-surface-3 hover:text-t1 grid place-items-center">
                <SquarePen className="w-4 h-4" />
              </button>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 rounded-full text-t3 hover:bg-surface-3 hover:text-t1 grid place-items-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {view === "history" ? (
                <ChatHistory activeId={current.id} version={version} onOpen={openFromHistory} onNew={newChat} onDeleted={afterDelete} />
              ) : (
                <AiChat
                  key={current.id ?? `new-${current.module}`}
                  module={current.module}
                  turns={current.turns}
                  onTurns={(fn) => update((s) => ({ ...s, turns: fn(s.turns) }))}
                  chatId={current.id}
                  onSaved={(id) => { update((s) => ({ ...s, id })); setVersion((v) => v + 1); }}
                  suggestions={suggestionsFor(current.module, activeBusiness?.typeKey)}
                  compact
                  placeholder={`Ask about ${label.toLowerCase()}…`}
                  title={`Ask about ${label.toLowerCase()}`}
                />
              )}
            </div>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}
