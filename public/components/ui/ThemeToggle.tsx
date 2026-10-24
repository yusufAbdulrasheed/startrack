import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  return (
    <button
      onClick={() => setDark(toggleTheme() === "dark")}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "w-10 h-10 rounded-full grid place-items-center text-t2 hover:bg-surface-3 hover:text-t1 transition-colors",
        className
      )}
    >
      {dark ? <Sun className="w-[17px] h-[17px]" /> : <Moon className="w-[17px] h-[17px]" />}
    </button>
  );
}
