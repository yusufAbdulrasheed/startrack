import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { api } from "@/lib/api";

const POLL_MS = 30_000;

/** Header shortcut to Team chat, with the number of messages not yet read. */
export function ChatButton() {
  const [unread, setUnread] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let live = true;
    const ask = () => {
      if (document.hidden) return;
      api<{ unread: number }>("/chat/unread").then((r) => { if (live) setUnread(r.unread); }).catch(() => {});
    };
    ask();
    const t = setInterval(ask, POLL_MS);
    document.addEventListener("visibilitychange", ask);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", ask); };
    // Asking again when the page changes keeps the badge honest right after reading messages.
  }, [pathname]);

  return (
    <Link
      to="/app/chat"
      title={unread ? `${unread} unread message${unread === 1 ? "" : "s"}` : "Team chat"}
      aria-label={unread ? `Team chat, ${unread} unread` : "Team chat"}
      className="relative grid place-items-center w-10 h-10 rounded-full border border-line-2 bg-surface text-t2 hover:text-primary hover:border-primary transition-colors"
    >
      <MessageCircle className="w-[18px] h-[18px]" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
