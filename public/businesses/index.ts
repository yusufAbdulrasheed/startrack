/**
 * The businesses StarTrack runs — the browser half.
 *
 * One line per business. Everything the shared app knows about a business's
 * screens comes through here: the routes it adds and its icon. (Its name,
 * wording and menu entries come from its manifest, server/businesses/<key>/.)
 *
 * To add a business: build public/businesses/<key>/ui.ts, then add it here.
 * Shared client code must not import a business's screens directly; only this
 * file does (`npm run check:architecture`).
 */
import { Store } from "lucide-react";
import type { BusinessUI } from "./types";
import supermarket from "./supermarket/ui";
import blinds from "./blinds/ui";
import electronics from "./electronics/ui";
import academy from "./academy/ui";
import poultry from "./poultry/ui";
import water from "./water/ui";

export const BUSINESS_UIS: BusinessUI[] = [supermarket, blinds, electronics, academy, poultry, water];

/** The icon for a business type; a plain shop for a type the app no longer knows. */
export const businessIcon = (typeKey?: string) => BUSINESS_UIS.find((u) => u.key === typeKey)?.icon ?? Store;
