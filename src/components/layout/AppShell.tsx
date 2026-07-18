import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useSession } from "@/lib/session";

// The conversion hook: always visible while exploring the sandbox.
function DemoBanner() {
  const { session, logout } = useSession();
  const navigate = useNavigate();
  if (!session?.demo) return null;
  return (
    <div className="shrink-0 bg-gradient-to-r from-brand-700 to-brand-500 text-white px-4 py-2 flex items-center gap-2 flex-wrap text-[12px] font-semibold">
      <Sparkles className="w-4 h-4 shrink-0" />
      <span>You're exploring the demo shop — sell, return, approve, break things. It all resets within 24 hours.</span>
      <button
        onClick={() => { logout(); navigate("/register"); }}
        className="ml-auto shrink-0 px-3 h-7 rounded-lg bg-white text-brand-800 font-bold hover:opacity-90 transition"
      >
        Create your own business →
      </button>
    </div>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Navigating closes the mobile drawer.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-full flex flex-col bg-canvas">
    <DemoBanner />
    <div className="flex-1 flex min-h-0">
      {/* Mobile backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}
      <Sidebar open={menuOpen} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setMenuOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
    </div>
  );
}
