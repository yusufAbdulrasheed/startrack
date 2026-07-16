import { useState } from "react";
import { Bell, ChevronDown, Moon, Search, Store, Sun } from "lucide-react";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Mock context — replaced by real tenancy state in Phase 1.
const MOCK = {
  business: "Tado Foods",
  branches: ["Wholesale", "Retail"],
};

export function Topbar() {
  const [branch, setBranch] = useState(MOCK.branches[0]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  return (
    <header className="h-16 shrink-0 bg-surface border-b border-line flex items-center gap-3 px-4">
      {/* Business → Branch switcher (Account layer stays invisible until 2+ businesses) */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-surface-2 border border-line text-[13px] font-semibold text-t1">
          <Store className="w-4 h-4 text-primary" />
          {MOCK.business}
        </div>
        <div className="relative">
          <button
            onClick={() => setBranchOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-line-2 text-[13px] font-medium text-t2 hover:bg-surface-3 transition-colors"
          >
            {branch}
            <ChevronDown className="w-3.5 h-3.5 text-t3" />
          </button>
          {branchOpen && (
            <div className="absolute top-full mt-1 left-0 w-44 bg-surface border border-line-2 rounded-xl shadow-e2 py-1 z-50">
              {MOCK.branches.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setBranch(b);
                    setBranchOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[13px] hover:bg-surface-3 transition-colors",
                    b === branch ? "text-primary font-semibold" : "text-t2"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Global search */}
      <div className="flex-1 max-w-md mx-auto relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
        <input
          placeholder="Search anything…  (Ctrl K)"
          className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-primary-softer transition-colors"
        />
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <button className="relative w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t3 hover:bg-surface-3 hover:text-t1 transition-colors">
          <Bell className="w-[17px] h-[17px]" />
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
            3
          </span>
        </button>
        <button
          onClick={() => setDark(toggleTheme() === "dark")}
          className="w-9 h-9 rounded-lg border border-line flex items-center justify-center text-t3 hover:bg-surface-3 hover:text-t1 transition-colors"
          title="Toggle theme"
        >
          {dark ? <Sun className="w-[17px] h-[17px]" /> : <Moon className="w-[17px] h-[17px]" />}
        </button>
      </div>
    </header>
  );
}
