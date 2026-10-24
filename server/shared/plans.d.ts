export type PlanKey = "free" | "pro" | "business";
export type LimitName = "businesses" | "branches" | "staff" | "products";
export type FeatureKey =
  | "ai" | "reports" | "advancedDashboard" | "barcodes" | "loyalty" | "transfers" | "expiry" | "suppliers" | "stockCount"
  | "returns" | "attendance" | "csvImport" | "productPhotos" | "verticals" | "receiptCustom" | "receiptTemplates"
  | "multiStore" | "sitePage" | "auditLog";

export interface PlanInfo {
  key: PlanKey;
  name: string;
  tagline: string;
  price: number;
  limits: Record<LimitName, number | null>;
  highlights: string[];
}

export const PLAN_ORDER: PlanKey[];
export const PLANS: Record<PlanKey, PlanInfo>;
export const FEATURES: Record<FeatureKey, { plan: PlanKey; label: string; blurb: string }>;
export function planRank(plan: string): number;
export function isPlan(v: unknown): v is PlanKey;
export function planAllows(plan: string, feature: string): boolean;
export function requiredPlanFor(feature: string): PlanKey;
export function featuresFor(plan: string): FeatureKey[];
export function limitOf(plan: string, name: LimitName): number | null;
export const TRIAL_DAYS: number;
export interface PlanStatus { plan: PlanKey; lapsed: boolean; trial: boolean; legacy: boolean; periodEnd: Date | null }
export function planStatus(account: { isSandbox?: boolean; subscription?: { plan?: string; trial?: boolean; currentPeriodEnd?: Date | string | null } | null } | null | undefined, now?: Date): PlanStatus;
export function effectivePlan(account: { isSandbox?: boolean; subscription?: { plan?: string; currentPeriodEnd?: Date | string | null } | null } | null | undefined, now?: Date): PlanKey;
export function isLegacyAccount(account: { isSandbox?: boolean; subscription?: { plan?: string } | null } | null | undefined): boolean;
