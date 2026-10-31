/**
 * Makes text safe to use inside a MongoDB $regex: what a user types in a search
 * box is matched literally, never read as a pattern (which could be malformed,
 * match everything, or be written to run for ages).
 */
export const escapeRegex = (v) => String(v ?? "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
