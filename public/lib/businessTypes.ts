// Terminology per business type, derived from the single definition both
// sides of the app share. Before the monolith restructure this table was
// duplicated here by hand and drifted from the server's copy; now there is
// one source and the client just narrows it to the fields the UI needs.
import { BUSINESS_TYPES, typeTemplate } from "#shared/businessTypes.js";

export type TypeMeta = { label: string; products: string; pos: string; positions: string[]; allowedUnits: string[] };

type Template = {
  label: string; terminology: { products: string }; posLabel: string;
  positions?: string[]; allowedUnits?: string[];
};

const narrow = (t: Template): TypeMeta => ({
  label: t.label,
  products: t.terminology.products,
  pos: t.posLabel,
  // Suggested job titles for the Staff "Position" field — only the business
  // types with a real org chart (hotel, for now) carry these; everyone else
  // gets an empty list and the UI falls back to free text.
  positions: t.positions || [],
  // The unit dropdown on the product form narrows to this list when the
  // trade has one (water, poultry); everyone else keeps free text.
  allowedUnits: t.allowedUnits || [],
});

export const TYPE_META: Record<string, TypeMeta> = Object.fromEntries(
  Object.entries(BUSINESS_TYPES as Record<string, Template>).map(([key, t]) => [key, narrow(t)])
);

export function typeMeta(typeKey?: string): TypeMeta {
  return narrow(typeTemplate(typeKey) as Template);
}
