// Minimal in-memory sliding-window limiter. Keyed however the caller wants
// (PIN attempts key on the business code — a global throttle per business,
// deliberately not per-client, so an attacker can't reset it by rotating IPs).
const buckets = new Map();

export function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/**
 * rateLimit() for a route handler: true when the request may go on, otherwise it
 * has already been answered with the standard 429 (so the caller just returns).
 */
export function allow(res, key, limit) {
  if (rateLimit(key, limit)) return true;
  res.status(429).json({ error: "rate_limited", message: "Too many requests. Try again shortly." });
  return false;
}

/**
 * A lockout that counts only FAILURES (wrong passwords), so signing in correctly
 * never uses it up. blocked() is checked before the password is even looked at.
 */
export function failureGuard(key, { max, windowMs }) {
  const live = () => (buckets.get(key) || []).filter((t) => Date.now() - t < windowMs);
  return {
    blocked: () => live().length >= max,
    fail: () => buckets.set(key, [...live(), Date.now()]),
    clear: () => buckets.delete(key),
  };
}

// Light periodic sweep so long-running processes don't accumulate dead keys.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < 10 * 60 * 1000);
    if (live.length) buckets.set(key, live);
    else buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();
