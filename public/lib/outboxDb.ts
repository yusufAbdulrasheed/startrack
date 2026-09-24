// IndexedDB mirror of the sales outbox (public/lib/outbox.ts). A service
// worker cannot read localStorage — separate execution context, IndexedDB/
// Cache API only — so this is what makes Background Sync possible: the SW's
// sync handler (public/sw.js) reads from here, not from localStorage.
// localStorage stays the source of truth for the open-tab UI; this is only
// ever a mirror, written alongside it, never read back on this side.
const DB_NAME = "startrack-outbox";
const STORE = "sales";

export type QueuedSaleRecord = {
  clientSaleId: string;
  businessId: string;
  branchId: string;
  body: Record<string, unknown>;
  queuedAt: string;
  // Snapshotted at enqueue time — the SW has no access to the main thread's
  // in-memory token/tenant state (see public/lib/api.ts), so the sale must
  // carry everything it needs to submit itself.
  token: string | null;
};

function openDb(): Promise<IDBDatabase> {
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

/** Never throws — IndexedDB can be unavailable (private browsing, etc.); when
 *  it is, Background Sync simply has nothing to replay and the existing
 *  online-event flush in outbox.ts still covers the open-tab case. */
export async function idbPutSale(record: QueuedSaleRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* see above */
  }
}

export async function idbDeleteSale(clientSaleId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(clientSaleId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* see above */
  }
}

/** Feature-detected — where Background Sync isn't supported (notably
 *  Safari/iOS), this silently no-ops and behavior is exactly what already
 *  exists: the foreground `window 'online'` flush in outbox.ts/POS.tsx. */
export async function registerOutboxSync(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    if (!("sync" in reg)) return;
    await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register("flush-sales-outbox");
  } catch {
    /* best-effort only */
  }
}

/** Fires cb(clientSaleId) whenever the SW syncs a sale in the background —
 *  the open tab's job is just to keep its own localStorage copy in step. */
export function onOutboxSynced(cb: (clientSaleId: string, ok: boolean) => void): () => void {
  if (!("serviceWorker" in navigator)) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data?.type === "outbox-synced") cb(e.data.clientSaleId, e.data.ok);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
