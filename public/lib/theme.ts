// v2 key: abandons any theme that older builds auto-saved, so everyone re-defaults
// to light. Only an explicit user toggle persists from now on.
const KEY = "startrack.theme.v2";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  return "light"; // StarTrack is light-first
}

// persist=false on boot so the default is never "locked in"; true on explicit toggle.
export function applyTheme(theme: Theme, persist = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  if (persist) localStorage.setItem(KEY, theme);
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
  applyTheme(next, true);
  return next;
}
