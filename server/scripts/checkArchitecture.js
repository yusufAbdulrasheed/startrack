/**
 * Architecture guard: businesses stay independent, the platform stays shared.
 *
 *   node server/scripts/checkArchitecture.js        (npm run check:architecture)
 *
 * It reads every source file and checks who imports whom:
 *
 *   SERVER
 *   1. A business (server/businesses/<key>/) may import only its OWN files, the
 *      platform's public interface (#platform/index.js, #platform/contract.js)
 *      and third-party packages. Never another business, never a platform
 *      module's internals (#modules, #core, #shared).
 *   2. A business manifest is plain data: it imports nothing, because the
 *      browser loads it too.
 *   3. The platform never imports a business. Two files are the only doors, and
 *      they exist to list the installed businesses: server/platform/registry.js
 *      and server/shared/businessTypes.js (plus the two list files inside
 *      server/businesses/ itself).
 *
 *   CLIENT
 *   4. A business's screens (public/businesses/<key>/) may import shared client
 *      code (@/...), the shared types (#shared/...) and their own files. Never
 *      another business's screens.
 *   5. Shared client code never imports a business's screens directly. Only
 *      public/businesses/index.ts (the list of installed businesses) does.
 *
 * Exits with a non-zero code and a list of every violation, so it can gate a
 * build or run as a test (e2e/architecture.spec.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(js|mjs|ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Every module specifier a file imports (static, re-export, or dynamic). */
function specifiers(src) {
  const text = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  const re = /(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] || m[2]);
  return out;
}

const violations = [];
const bad = (file, spec, why) => violations.push(`${rel(file)}\n    imports "${spec}"\n    ${why}`);

// ── resolve a specifier to a repo path (or null for a package) ────────────────
function resolveTarget(file, spec) {
  if (spec.startsWith(".")) return path.resolve(path.dirname(file), spec);
  if (spec.startsWith("@/")) return path.resolve(root, "public", spec.slice(2));
  if (spec.startsWith("#businesses/")) return path.resolve(root, "server/businesses", spec.slice("#businesses/".length));
  if (spec.startsWith("#modules/")) return path.resolve(root, "server/modules", spec.slice("#modules/".length));
  if (spec.startsWith("#core/")) return path.resolve(root, "server/core", spec.slice("#core/".length));
  if (spec.startsWith("#shared/")) return path.resolve(root, "server/shared", spec.slice("#shared/".length));
  if (spec.startsWith("#platform/")) return path.resolve(root, "server/platform", spec.slice("#platform/".length));
  return null;
}

const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
const businessesDir = path.join(root, "server/businesses");
const businessOf = (p) => {
  const r = path.relative(businessesDir, p);
  if (r.startsWith("..") || path.isAbsolute(r)) return null;
  const first = r.split(path.sep)[0];
  return isDir(path.join(businessesDir, first)) ? first : null; // a file directly in server/businesses/ is not a business
};

const PLATFORM_API = new Set(["#platform/index.js", "#platform/contract.js"]);
const SERVER_DOORS = new Set([
  "server/platform/registry.js",
  "server/shared/businessTypes.js",
]);

// ── server ────────────────────────────────────────────────────────────────────
for (const file of walk(path.join(root, "server"))) {
  const f = rel(file);
  const owner = businessOf(file);
  const src = fs.readFileSync(file, "utf8");
  for (const spec of specifiers(src)) {
    if (owner) {
      // 2. manifests are plain data
      if (path.basename(file) === "manifest.js") { bad(file, spec, "A manifest is plain data and must import nothing (the browser loads it)."); continue; }
      if (spec.startsWith("node:")) continue;
      const target = resolveTarget(file, spec);
      if (target === null) {
        if (spec.startsWith("#")) bad(file, spec, "Unknown alias.");
        continue; // a third-party package
      }
      if (spec.startsWith("#platform/")) {
        if (!PLATFORM_API.has(spec)) bad(file, spec, "A business may import only #platform/index.js (the platform's public interface) and #platform/contract.js.");
        continue;
      }
      if (spec.startsWith("#modules/") || spec.startsWith("#core/") || spec.startsWith("#shared/")) {
        bad(file, spec, "A business must not reach into the platform's internals. Use #platform/index.js (add what is missing there, deliberately).");
        continue;
      }
      // relative (or #businesses/): must stay inside this same business
      const targetOwner = businessOf(target);
      if (targetOwner !== owner) bad(file, spec, `A business may import only its own files; this reaches into ${targetOwner ? `the "${targetOwner}" business` : "the shared code"}.`);
    } else if (!SERVER_DOORS.has(f) && !/^server\/businesses\/[^/]+\.js$/.test(f)) {
      // 3. the platform never imports a business
      const target = resolveTarget(file, spec);
      if (target && businessOf(target) !== null) bad(file, spec, "The platform must not import a business. Ask the registry (server/platform/registry.js) instead.");
    }
  }
}

// ── client ────────────────────────────────────────────────────────────────────
const clientBiz = path.join(root, "public/businesses");
const clientOwnerOf = (p) => {
  const r = path.relative(clientBiz, p);
  if (r.startsWith("..") || path.isAbsolute(r)) return null;
  const first = r.split(path.sep)[0];
  return isDir(path.join(clientBiz, first)) ? first : null; // shared files in public/businesses/ are not a business
};
for (const file of walk(path.join(root, "public"))) {
  const f = rel(file);
  const owner = clientOwnerOf(file);
  for (const spec of specifiers(fs.readFileSync(file, "utf8"))) {
    const target = resolveTarget(file, spec);
    if (!target) continue;
    const targetOwner = clientOwnerOf(target);
    if (owner) {
      // 4. a business's screens stay with their own business
      if (targetOwner && targetOwner !== owner) bad(file, spec, `A business's screens may import only their own files; this reaches into the "${targetOwner}" business.`);
    } else if (targetOwner && f !== "public/businesses/index.ts") {
      // 5. only the list of installed businesses imports a business's screens
      bad(file, spec, "Shared client code must not import a business's screens. Businesses register through public/businesses/index.ts.");
    }
  }
}

if (violations.length) {
  console.error(`\n✗ Architecture check failed — ${violations.length} problem${violations.length === 1 ? "" : "s"}:\n`);
  for (const v of violations) console.error(`  ${v}\n`);
  process.exit(1);
}
console.log("✓ Architecture check passed: businesses are independent, the platform imports none of them.");
