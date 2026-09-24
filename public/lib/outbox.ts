import { api, ApiError, getToken } from "./api";
import { idbPutSale, idbDeleteSale, registerOutboxSync } from "./outboxDb";

/**
 * Offline sales outbox. When checkout can't reach the server, the sale is
 * queued here (per business+branch) and replayed when the network returns.
 * The server dedupes on clientSaleId, so a sale can never post twice —
 * flushing is always safe to retry.
 */
export type QueuedSale = {
  clientSaleId: string;
  body: Record<string, unknown>; // the exact /sales payload
  total: number;
  itemCount: number;
  queuedAt: string;
  error?: string; // set when the server rejected it (needs human attention)
};

const key = (businessId: string, branchId: string) => `startrack.outbox.${businessId}.${branchId}`;

export function outboxList(businessId: string, branchId: string): QueuedSale[] {
  try {
    return JSON.parse(localStorage.getItem(key(businessId, branchId)) || "[]");
  } catch {
    return [];
  }
}

function save(businessId: string, branchId: string, items: QueuedSale[]) {
  localStorage.setItem(key(businessId, branchId), JSON.stringify(items));
}

export function outboxEnqueue(businessId: string, branchId: string, sale: QueuedSale) {
  save(businessId, branchId, [...outboxList(businessId, branchId), sale]);
  // Mirror into IndexedDB so a service worker can replay it even after this
  // tab closes (localStorage isn't visible from there — see outboxDb.ts),
  // then ask for a background sync. Both are best-effort: if either isn't
  // supported (Safari/iOS, private browsing), the existing online-event
  // flush below still covers the open-tab case exactly as before.
  idbPutSale({ clientSaleId: sale.clientSaleId, businessId, branchId, body: sale.body, queuedAt: sale.queuedAt, token: getToken() });
  registerOutboxSync();
}

export function outboxDiscard(businessId: string, branchId: string, clientSaleId: string) {
  save(businessId, branchId, outboxList(businessId, branchId).filter((s) => s.clientSaleId !== clientSaleId));
  idbDeleteSale(clientSaleId);
}

/**
 * Try to post every queued sale, oldest first.
 * - success → removed from the queue
 * - server rejection (insufficient stock etc.) → kept, flagged with the reason
 * - network still down → stop; everything stays queued
 */
export async function outboxFlush(businessId: string, branchId: string): Promise<{ sent: number; failed: number; offline: boolean }> {
  const items = outboxList(businessId, branchId);
  let sent = 0, failed = 0, offline = false;

  for (const item of items) {
    try {
      await api("/sales", { method: "POST", body: JSON.stringify(item.body) });
      outboxDiscard(businessId, branchId, item.clientSaleId);
      sent++;
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        offline = true;
        break; // still no network — keep everything, try later
      }
      // The server answered but said no (e.g. stock ran out while offline).
      const remaining = outboxList(businessId, branchId).map((s) =>
        s.clientSaleId === item.clientSaleId ? { ...s, error: (err as Error).message } : s
      );
      save(businessId, branchId, remaining);
      failed++;
    }
  }
  return { sent, failed, offline };
}
