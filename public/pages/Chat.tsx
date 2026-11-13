import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Send, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { fmtDate, fmtTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Room = {
  id: string; kind: "team" | "dm"; title: string; subtitle: string; role?: string; unread: number;
  last: { at: string; text: string; by: string } | null;
};
type Msg = { id: string; room: string; senderId: string; senderName: string; senderRole: string; text: string; at: string; mine: boolean };

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Sales rep" };
const ROLE_TONE: Record<string, string> = {
  owner: "bg-primary-soft text-primary", admin: "bg-primary-soft text-primary",
  manager: "bg-warning-soft text-warning", staff: "bg-success-soft text-success",
};

// How often the open conversation, and the list around it, ask for anything new.
const THREAD_MS = 3000;
const ROOMS_MS = 10000;

const initial = (name: string) => (name.trim()[0] || "?").toUpperCase();

function RoleChip({ role }: { role?: string }) {
  if (!role) return null;
  return <span className={cn("px-1.5 py-px rounded-full text-[10px] font-bold leading-4", ROLE_TONE[role] || "bg-surface-3 text-t3")}>{ROLE_LABEL[role] || role}</span>;
}

/**
 * Team chat: one shared room for the whole business, plus a private
 * conversation with each colleague — owner, manager and sales rep all in the
 * same place. New messages are fetched every few seconds while the page is
 * open and visible (see server/modules/chat for why it polls).
 */
export function Chat() {
  const { activeBusiness } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [roomId, setRoomId] = useState("team");
  const [onThread, setOnThread] = useState(false); // phones show the list OR the conversation
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastAt = useRef<string | null>(null);
  const opened = useRef(false); // the first load of the open conversation has landed, so polling may start
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // keep the view on the newest message unless they scrolled up to read

  const loadRooms = useCallback(async () => {
    try {
      const r = await api<{ rooms: Room[] }>("/chat/rooms");
      setRooms(r.rooms);
    } catch { /* keep the list we have */ }
    setRoomsLoaded(true);
  }, []);

  useEffect(() => {
    loadRooms();
    const t = setInterval(() => { if (!document.hidden) loadRooms(); }, ROOMS_MS);
    return () => clearInterval(t);
  }, [loadRooms]);

  // Open a conversation, then keep it current.
  useEffect(() => {
    let live = true;
    lastAt.current = null;
    opened.current = false;
    stick.current = true;
    setMessages([]);
    setLoading(true);
    setError("");

    const append = (incoming: Msg[]) => {
      if (!incoming.length) return;
      setMessages((cur) => {
        const have = new Set(cur.map((m) => m.id));
        const fresh = incoming.filter((m) => !have.has(m.id));
        return fresh.length ? [...cur, ...fresh] : cur;
      });
      lastAt.current = incoming[incoming.length - 1].at;
    };

    api<{ messages: Msg[] }>(`/chat/messages?room=${encodeURIComponent(roomId)}`)
      .then((r) => { if (live) { append(r.messages); opened.current = true; setLoading(false); loadRooms(); } })
      .catch((e) => { if (live) { setError(e.message || "Couldn't open this conversation."); setLoading(false); } });

    const t = setInterval(async () => {
      if (document.hidden || !opened.current) return; // wait for the first load; an EMPTY room still has to be watched
      try {
        const since = lastAt.current ? `&since=${encodeURIComponent(lastAt.current)}` : "";
        const r = await api<{ messages: Msg[] }>(`/chat/messages?room=${encodeURIComponent(roomId)}${since}`);
        if (live && r.messages.length) { append(r.messages); loadRooms(); }
      } catch { /* a missed poll is fine; the next one catches up */ }
    }, THREAD_MS);

    return () => { live = false; clearInterval(t); };
  }, [roomId, loadRooms]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, loading, onThread]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const r = await api<{ message: Msg }>("/chat/messages", { method: "POST", body: JSON.stringify({ room: roomId, text: body }) });
      stick.current = true;
      setMessages((cur) => (cur.some((m) => m.id === r.message.id) ? cur : [...cur, r.message]));
      lastAt.current = r.message.at;
      setText("");
      loadRooms();
    } catch (e: any) {
      setError(e.message || "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  const room = rooms.find((r) => r.id === roomId);
  const isTeam = roomId === "team";

  const pick = (id: string) => { setRoomId(id); setOnThread(true); };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1100px] mx-auto h-full flex flex-col">
      <PageHeader title="Team chat" subtitle={`Talk to everyone at ${activeBusiness?.name || "your business"} — owner, managers and sales reps.`} />

      <Card className="flex-1 min-h-[420px] overflow-hidden grid md:grid-cols-[290px_minmax(0,1fr)]">
        {/* Conversations */}
        <div className={cn("border-r border-line flex flex-col min-h-0", onThread ? "max-md:hidden" : "")}>
          <div className="flex-1 overflow-y-auto">
            {!roomsLoaded && <div className="p-4 text-[12.5px] text-t3">Loading…</div>}
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line/60 transition-colors hover:bg-surface-2",
                  r.id === roomId && "md:bg-primary-softer"
                )}
              >
                <span className={cn("grid place-items-center w-10 h-10 rounded-full shrink-0 text-[14px] font-bold", r.kind === "team" ? "bg-primary text-on-primary" : "bg-primary-soft text-primary")}>
                  {r.kind === "team" ? <Users className="w-[18px] h-[18px]" /> : initial(r.title)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-t1 truncate">{r.title}</span>
                    <RoleChip role={r.role} />
                    {r.last && <span className="ml-auto text-[10.5px] text-t4 shrink-0">{fmtTime(r.last.at)}</span>}
                  </span>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span className="text-[12px] text-t3 truncate flex-1">
                      {r.last ? `${r.kind === "team" ? `${r.last.by.split(" ")[0]}: ` : ""}${r.last.text}` : r.subtitle}
                    </span>
                    {r.unread > 0 && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center">{r.unread > 99 ? "99+" : r.unread}</span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div className={cn("flex flex-col min-h-0 min-w-0", !onThread ? "max-md:hidden" : "")}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
            <button onClick={() => setOnThread(false)} className="md:hidden w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-t2 hover:bg-surface-3" aria-label="Back to conversations">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className={cn("grid place-items-center w-9 h-9 rounded-full shrink-0 text-[13px] font-bold", isTeam ? "bg-primary text-on-primary" : "bg-primary-soft text-primary")}>
              {isTeam ? <Users className="w-4 h-4" /> : initial(room?.title || "?")}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-semibold text-t1 truncate">{room?.title || "Team chat"}</span>
                <RoleChip role={room?.role} />
              </div>
              <div className="text-[11.5px] text-t3">{isTeam ? room?.subtitle || "Everyone in this business" : "Private conversation"}</div>
            </div>
          </div>

          <div
            ref={listRef}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-1.5 bg-surface-2/40"
          >
            {loading ? (
              <div className="text-[12.5px] text-t3 text-center py-8">Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center">
                <span className="grid place-items-center w-12 h-12 rounded-2xl bg-surface-3 text-t4 mb-3"><MessageCircle className="w-6 h-6" /></span>
                <div className="text-[13px] font-semibold text-t2">No messages yet</div>
                <div className="text-[12px] text-t4 mt-1">{isTeam ? "Say hello to the team." : `Start the conversation with ${room?.title || "them"}.`}</div>
              </div>
            ) : (
              messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString();
                const startsRun = !prev || prev.senderId !== m.senderId || newDay;
                return (
                  <div key={m.id}>
                    {newDay && <div className="text-center text-[11px] text-t4 font-semibold py-2">{fmtDate(m.at)}</div>}
                    <div className={cn("flex", m.mine ? "justify-end" : "justify-start", startsRun && i > 0 && !newDay && "mt-2")}>
                      <div className={cn("max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-snug",
                        m.mine ? "bg-primary text-on-primary rounded-br-md" : "bg-surface border border-line text-t1 rounded-bl-md")}>
                        {!m.mine && isTeam && startsRun && (
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11.5px] font-bold text-t2">{m.senderName}</span>
                            <RoleChip role={m.senderRole} />
                          </div>
                        )}
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                        <div className={cn("text-[10px] mt-0.5 text-right", m.mine ? "text-on-primary/70" : "text-t4")}>{fmtTime(m.at)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-line p-3">
            {error && <div className="mb-2 px-3 py-2 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">{error}</div>}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={1}
                maxLength={2000}
                placeholder="Write a message…"
                aria-label="Message"
                className="flex-1 max-h-32 min-h-[44px] resize-none px-4 py-3 rounded-2xl bg-surface-2 border border-line text-[14px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                aria-label="Send"
                className="w-11 h-11 shrink-0 rounded-full bg-primary text-on-primary grid place-items-center disabled:opacity-50 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
}
