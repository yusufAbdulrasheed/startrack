/**
 * Chart palette — validated with the dataviz palette checker.
 *   light categorical: #2254e0,#0f9f76,#e8930f,#8b5cf6  (all checks pass; amber
 *     carries a contrast WARN → always give amber marks a direct label)
 *   dark  categorical: #3b6ef5,#0f9f76,#c97c0a,#8b5cf6  (all checks pass)
 * Assign hues in FIXED order, never cycled. Text stays in ink tokens.
 */
export const CHART = {
  light: {
    categorical: ["#2254e0", "#0f9f76", "#e8930f", "#8b5cf6"],
    brand: "#2254e0",
    brandSoft: "rgba(34,84,224,0.14)",
    grid: "rgba(18,42,92,0.08)",
    axis: "#6b84af",
    surface: "#ffffff",
  },
  dark: {
    categorical: ["#3b6ef5", "#0f9f76", "#c97c0a", "#8b5cf6"],
    brand: "#3b6ef5",
    brandSoft: "rgba(59,110,245,0.20)",
    grid: "rgba(255,255,255,0.08)",
    axis: "#4d6a96",
    surface: "#0f1d33",
  },
};

export function chartTokens() {
  const dark = document.documentElement.classList.contains("dark");
  return dark ? CHART.dark : CHART.light;
}
