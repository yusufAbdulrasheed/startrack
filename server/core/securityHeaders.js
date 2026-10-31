import { config } from "#core/config.js";

/**
 * Browser-side protections on every response: no content-type guessing, no
 * framing by other sites (clickjacking), no leaking full URLs to other sites,
 * and only the camera permission the QR scanner needs. HTTPS is pinned in
 * production. The CSP is deliberately limited to the directives that cannot
 * break the app (framing, <base>, plugins, form targets).
 */
export function securityHeaders(_req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Content-Security-Policy": "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  });
  if (config.isProd) res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  next();
}
