import type { ComponentType } from "react";

/**
 * What a business contributes to the screen, as the browser sees it.
 *
 * The data half of a business (its name, wording, categories, features and the
 * pages it adds to the menu) lives in its manifest and reaches the browser
 * through #shared/businessTypes.js. This is the other half: things that can
 * only exist in the browser, namely its icon and its screens.
 *
 * A business's screens live in public/businesses/<key>/ and may import shared
 * client code (@/...) and their own files, never another business's.
 * `npm run check:architecture` enforces it.
 */
export type BusinessUI = {
  key: string;
  /** Shown in the business picker, the business switcher and the sign-up form. */
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Screens this business adds under /app/. `feature` is the plan feature that unlocks it. */
  routes: { path: string; feature?: string; Page: ComponentType }[];
  /**
   * What the per-screen assistant suggests asking (the server owns what it KNOWS,
   * in server/businesses/<key>/ai.js).
   *   screens   this business's own screens: their label and opening questions.
   *   prompts   extra opening questions this business asks of a platform screen
   *             (its dashboard, "ask AI", customers, expenses...).
   */
  ai?: {
    screens?: Record<string, { label: string; prompts: string[] }>;
    prompts?: Record<string, string[]>;
  };
};

export const defineBusinessUI = (ui: BusinessUI): BusinessUI => ui;
