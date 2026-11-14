// Types for the shared business-type definitions. The implementation is plain
// JavaScript because the API imports it directly at runtime; this file lets
// the TypeScript client consume it without a build step in between.
export type ToggleableModule = { key: string; label: string; hint: string; /** Set when only that one business can use it. */ owner?: string };

/** Capabilities a business can have: the platform's own, or one the business declares for itself. */
export type Capability = string;

/** Present only on a business that sells services rather than stock (academy). */
export type ServiceTerms = {
  item: string; items: string; saleNoun: string; priceLabel: string;
  showDuration: boolean; physical: boolean;
};

/** A page a business adds to the menu (it appears under that menu section). */
export type BusinessNavItem = {
  group: "operations" | "inventory";
  to: string; label: string; perm?: string; feature?: string;
};

/** What a business declares about itself in server/businesses/<key>/manifest.js. */
export type BusinessTypeTemplate = {
  key: string;
  label: string;
  terminology: { products: string };
  posLabel: string;
  defaultCategories: string[];
  modules: string[];
  tagline: string;
  capabilities: Capability[];
  capabilityInfo?: Record<string, { label: string; hint: string }>;
  ownsModules?: { key: string; label: string; hint: string }[];
  skuPrefix?: string;
  allowedUnits?: string[];
  positions?: string[];
  service?: ServiceTerms;
  /** Which spreadsheet import a business means by "upload my list" (default: products). */
  primaryImport?: string;
  /** Where till staff land (a path under /app/); default is the till. */
  tillHome?: string;
  nav: BusinessNavItem[];
};

export declare const TOGGLEABLE_MODULES: ToggleableModule[];
export declare const ALL_TOGGLEABLE: string[];
export declare function modulesAvailableTo(typeKey?: string): ToggleableModule[];
export declare const BUSINESS_TYPES: Record<string, BusinessTypeTemplate>;
export declare const CAPABILITIES: Record<string, { label: string; hint: string }>;
export declare const ALL_CAPABILITIES: string[];
export declare function typeTemplate(typeKey?: string): BusinessTypeTemplate;
export declare function hasCapability(typeKey: string | undefined, capability: string): boolean;
export declare function typesWithCapability(capability: string): string[];
