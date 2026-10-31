import { onColor } from "@/lib/site";

/** The business's own look, applied to the storefront the same way the public page applies it. */
export type StoreTheme = {
  dark: boolean; bg: string; surface: string; text: string; muted: string; line: string; soft: string; accent: string; onAccent: string; danger: string; success: string;
};

export function storeTheme(accent: string, mode: "light" | "dark"): StoreTheme {
  const dark = mode === "dark";
  const base = dark ? "#0b0e1f" : "#ffffff";
  return {
    dark,
    bg: dark ? "#0b0e1f" : "#f7f8fc",
    surface: dark ? "#151a3a" : "#ffffff",
    text: dark ? "#f4f5ff" : "#0f1330",
    muted: dark ? "#a7accb" : "#5d6384",
    line: dark ? "rgba(255,255,255,0.1)" : "#e6e8f4",
    soft: `color-mix(in srgb, ${accent} ${dark ? 18 : 9}%, ${base})`,
    accent,
    onAccent: onColor(accent),
    danger: dark ? "#ff8f9b" : "#d02b3c",
    success: dark ? "#4fd1a1" : "#0f9f6e",
  };
}

export const STATUS_LABEL: Record<string, string> = {
  placed: "Waiting for the shop",
  confirmed: "Confirmed",
  ready: "Ready",
  out_for_delivery: "On its way",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Not accepted",
};
