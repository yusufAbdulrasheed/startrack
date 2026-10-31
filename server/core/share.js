import { config } from "#core/config.js";

/**
 * Helpers for anything that sends a person somewhere: a link back to this app,
 * or a WhatsApp message. One place, so every feature builds them the same way.
 */

/** This app's own address, never a caller-chosen one: APP_URL, else the request's origin, else its host. */
export function publicBase(req) {
  const origin = req.headers.origin && new URL(req.headers.origin).origin;
  return (config.appUrl || origin || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

/** Digits for wa.me. A leading 0 on an 11-digit number is read as Nigerian, the app's home market. */
export function waNumber(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  return d.startsWith("0") && d.length === 11 ? `234${d.slice(1)}` : d;
}

/** A wa.me link with the message filled in; without a usable number WhatsApp lets the sender pick the contact. */
export function waUrl(phone, text) {
  const n = waNumber(phone);
  return `https://wa.me/${n ? `${n}` : ""}?text=${encodeURIComponent(text)}`;
}
