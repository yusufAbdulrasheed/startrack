import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(minor: number, currency = "₦"): string {
  return currency + (minor / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 });
}
