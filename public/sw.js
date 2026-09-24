// Service worker source for vite-plugin-pwa's injectManifest strategy.
//
// Plain JS, not TS: this file runs in the ServiceWorkerGlobalScope, which
// the app's tsconfig (DOM lib only, no WebWorker lib — see tsconfig.app.json)
// doesn't model, and tsconfig.app.json's `include` covers all of public/
// with no exception for one file. Since allowJs isn't set, tsc -b simply
// skips this file entirely, while Vite (via vite-plugin-pwa) still bundles
// it as a normal ES module — the cleanest way to keep the main app's strict
// TS config and this file from fighting over which lib applies.
//
// generateSW's declarative runtimeCaching config can't host the custom
// `sync` handler below — that's the entire reason this is injectManifest
// and not generateSW.
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";

self.skipWaiting();
clientsClaim();

// The app shell — index.html, JS/CSS bundles, icons — injected at build
// time as self.__WB_MANIFEST.
precacheAndRoute(self.__WB_MANIFEST);

// Read-heavy, tolerant of staleness, genuinely useful with a flaky
// connection: staff can keep browsing the catalog/customers/settings.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/products") ||
    url.pathname.startsWith("/api/customers") ||
    url.pathname.startsWith("/api/settings"),
  new StaleWhileRevalidate({ cacheName: "startrack-api-cache" })
);

// Fresher when online, still viewable when not.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/metrics"),
  new NetworkFirst({ cacheName: "startrack-metrics-cache" })
);

// Deliberately NOT registered as routes — these always go straight to the
// network with no interception at all: stale auth must never silently
// succeed, a sale is handled by the outbox below (not the HTTP cache), and
// AI/platform answers must always be fresh.
//   /api/auth/*, POST /api/sales, /api/ai/*, /api/platform/*

// ── Background Sync: flush the queued-sales outbox, even after the tab that
//    queued a sale has closed. Feature-detected on the client side
//    (outboxDb.ts's registerOutboxSync) — where unsupported (Safari/iOS)
//    this handler simply never fires, and the existing foreground
//    `window 'online'` flush is what covers that browser instead.

const DB_NAME = "startrack-outbox";
const STORE = "sales";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "clientSaleId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllQueued() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteQueued(clientSaleId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(clientSaleId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function notifyClients(clientSaleId, ok) {
  const clients = await self.clients.matchAll();
  for (const client of clients) client.postMessage({ type: "outbox-synced", clientSaleId, ok });
}

async function flushOutbox() {
  const items = await getAllQueued();
  for (const item of items) {
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(item.token ? { Authorization: `Bearer ${item.token}` } : {}),
          ...(item.businessId ? { "x-business-id": item.businessId } : {}),
          ...(item.branchId ? { "x-branch-id": item.branchId } : {}),
        },
        body: JSON.stringify(item.body),
      });
      // The server dedupes on clientSaleId (sales.routes.js), so a retry can
      // never double-post — success and a real rejection (e.g. stock ran out
      // while offline) both resolve this item the same way here; a
      // rejection's reason is for the open-tab UI, not this background pass.
      if (res.ok || res.status < 500) {
        await deleteQueued(item.clientSaleId);
        await notifyClients(item.clientSaleId, res.ok);
      }
      // else (5xx): leave it queued, the next sync retries.
    } catch {
      // Still offline — stop here, the next sync event tries again.
      return;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "flush-sales-outbox") {
    event.waitUntil(flushOutbox());
  }
});
