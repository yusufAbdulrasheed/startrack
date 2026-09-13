// Types for the shared business-type definitions. The implementation is plain
// JavaScript because the API imports it directly at runtime; this file lets
// the TypeScript client consume it without a build step in between.
export type ToggleableModule = { key: string; label: string; hint: string };

export type Capability =
  | "rooms" | "folio" | "kitchen" | "kitchenQueue" | "production" | "cohorts" | "jobs"
  | "serials" | "medication" | "variants" | "appointments" | "weighing" | "meters"
  | "memberships" | "credit" | "lots" | "loyalty" | "coldChain";

export type BusinessTypeTemplate = {
  label: string;
  terminology: { products: string };
  posLabel: string;
  defaultCategories: string[];
  modules: string[];
  tagline: string;
  capabilities: Capability[];
  skuPrefix?: string;
  allowedUnits?: string[];
  positions?: string[];
};

export declare const TOGGLEABLE_MODULES: ToggleableModule[];
export declare const ALL_TOGGLEABLE: string[];
export declare const BUSINESS_TYPES: Record<string, BusinessTypeTemplate>;
export declare const CAPABILITIES: Record<Capability, { label: string; hint: string }>;
export declare const ALL_CAPABILITIES: Capability[];
export declare function typeTemplate(typeKey?: string): BusinessTypeTemplate;
export declare function hasCapability(typeKey: string | undefined, capability: Capability): boolean;
export declare function typesWithCapability(capability: Capability): string[];
