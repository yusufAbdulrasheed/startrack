import { config } from "#core/config.js";

/**
 * Finds candidate photos for a product from its NAME. Nothing is attached here:
 * the caller shows the candidates to a person, and only what they keep is saved.
 *
 * Sources, best first, whichever are available:
 *   Pexels / Pixabay — free API keys (PEXELS_API_KEY / PIXABAY_API_KEY), clean
 *                      stock photography, free for commercial use.
 *   Wikimedia Commons — needs no key, so photo-finding works out of the box. Only
 *                      openly-licensed files, and only ones whose title actually
 *                      mentions the product, otherwise a brand name gets a random
 *                      photo. Less polished, so expect more misses.
 */

const UA = "StarTrack/1.0 (product photo finder)";
const TIMEOUT_MS = 9000;

/** Hosts a chosen photo may come from — anything else is refused on save. */
export const PHOTO_HOSTS = ["images.pexels.com", "pixabay.com", "cdn.pixabay.com", "upload.wikimedia.org", "thumb.wikimedia.org"];

const STOP = new Set(["and", "the", "with", "for", "pack", "pcs", "piece", "pieces", "set", "of", "per", "new", "big", "small", "large", "mini", "special", "premium"]);

/** "Pepper Soup (catfish) 1L" → "pepper soup catfish". */
export function cleanQuery(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:l|ml|cl|kg|g|mg|pcs?|pieces?|packs?|cartons?|crates?|dozen|doz|x|inch|in|cm|mm|m|litres?|liters?|bags?)\b/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (q) => q.split(" ").filter((t) => t.length >= 3 && !STOP.has(t));

async function getJson(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pexels(q, n) {
  const key = config.photos.pexelsKey;
  if (!key) return null;
  const d = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}&size=medium`, { Authorization: key });
  if (!d) return [];
  return (d.photos || []).map((p) => ({
    url: p.src?.large || p.src?.medium,
    thumb: p.src?.medium || p.src?.small,
    credit: p.photographer ? `Photo by ${p.photographer} on Pexels` : "Pexels",
    source: "Pexels",
  })).filter((c) => c.url);
}

async function pixabay(q, n) {
  const key = config.photos.pixabayKey;
  if (!key) return null;
  const d = await getJson(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&per_page=${Math.max(3, n)}`);
  if (!d) return [];
  return (d.hits || []).slice(0, n).map((h) => ({
    url: h.webformatURL,
    thumb: h.previewURL || h.webformatURL,
    credit: h.user ? `Image by ${h.user} on Pixabay` : "Pixabay",
    source: "Pixabay",
  })).filter((c) => c.url);
}

const stripHtml = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function commons(q, n) {
  const want = tokens(q);
  if (!want.length) return [];
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.search = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "12",
    gsrsearch: `filetype:bitmap ${q}`, prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "640",
  }).toString();
  const d = await getJson(u.toString());
  const pages = Object.values(d?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const out = [];
  for (const pg of pages) {
    const info = pg.imageinfo?.[0];
    if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime || "")) continue;
    const title = String(pg.title || "").toLowerCase().replace(/^file:/, "").replace(/[_\-.]/g, " ");
    if (/\b(logo|map|flag|diagram|icon|screenshot|stamp|coat of arms|poster)\b/.test(title)) continue;
    if (!want.some((t) => title.includes(t))) continue; // not actually about this thing
    const meta = info.extmetadata || {};
    const lic = stripHtml(meta.LicenseShortName?.value);
    if (lic && !/^(cc|public domain|pd|gfdl)/i.test(lic)) continue;
    const artist = stripHtml(meta.Artist?.value).slice(0, 60);
    out.push({
      url: info.thumburl,
      thumb: info.thumburl,
      credit: `${artist || "Wikimedia Commons"}${lic ? ` · ${lic}` : ""} · Wikimedia Commons`,
      source: "Wikimedia Commons",
    });
    if (out.length >= n) break;
  }
  return out;
}

/** True when at least one photo source is reachable by configuration (Commons always is). */
export const photoSources = () => ["Wikimedia Commons", config.photos.pexelsKey && "Pexels", config.photos.pixabayKey && "Pixabay"].filter(Boolean);

/**
 * Up to `n` candidates for one product, best source first. `hint` (the
 * category) only widens a search that found nothing from the name alone.
 */
export async function findPhotos(name, hint = "", n = 3) {
  const q = cleanQuery(name);
  if (!q) return { query: q, candidates: [] };
  const tries = [q];
  const h = cleanQuery(hint);
  if (h && !q.includes(h)) tries.push(`${q} ${h}`);
  const seen = new Set();
  const candidates = [];
  for (const query of tries) {
    for (const source of [pexels, pixabay, commons]) {
      if (candidates.length >= n) break;
      const found = await source(query, n);
      for (const c of found || []) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        candidates.push(c);
        if (candidates.length >= n) break;
      }
      // A keyed source that returned something is good enough — don't pad with a noisier one.
      if (found && found.length) break;
    }
    if (candidates.length) break;
  }
  return { query: q, candidates };
}

/** Downloads a chosen photo (host-checked, size-capped, must really be an image). */
export async function downloadPhoto(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !PHOTO_HOSTS.includes(u.hostname)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(u, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "error" });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png|webp)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > 5 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
