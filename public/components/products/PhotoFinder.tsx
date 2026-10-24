import { useEffect, useMemo, useState } from "react";
import { Check, ImageOff, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/Field";
import { AiMark } from "@/components/ai/AiBits";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Candidate = { url: string; thumb: string; credit: string; source: string };
type Item = { id: string; name: string; category: string; candidates: Candidate[] };
type Suggest = { items: Item[]; remaining: number; sources: string[]; canStore: boolean };

/**
 * Finds a photo for each product that doesn't have one, by its name, and lets a
 * person look before anything is saved. The first match is pre-selected; tap it
 * again to skip a product, or pick another match. Stock photos are a guess from
 * a name, so this is deliberately a review step, never automatic.
 */
export function PhotoFinder({ open, onClose, ids, onDone }: { open: boolean; onClose: () => void; ids?: string[]; onDone?: (saved: number) => void }) {
  const { refreshData } = useSession();
  const [data, setData] = useState<Suggest | null>(null);
  const [pick, setPick] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [progress, setProgress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    setData(null);
    setError("");
    setLoading(true);
    api<Suggest>("/products/photos/suggest", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) })
      .then((d) => {
        if (!live) return;
        setData(d);
        setPick(Object.fromEntries(d.items.map((it) => [it.id, it.candidates.length ? 0 : null])));
      })
      .catch((e) => live && setError(e?.message || "Couldn't look up photos right now."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [open, ids]);

  const chosen = useMemo(
    () => (data?.items || []).filter((it) => pick[it.id] !== null && pick[it.id] !== undefined && it.candidates[pick[it.id] as number]),
    [data, pick],
  );
  const matched = (data?.items || []).filter((it) => it.candidates.length).length;

  // The next batch of products without a photo, added under the ones on screen.
  async function loadMore() {
    if (!data) return;
    setMore(true);
    setError("");
    try {
      const d = await api<Suggest>("/products/photos/suggest", { method: "POST", body: JSON.stringify({ ...(ids ? { ids } : {}), skip: data.items.map((i) => i.id) }) });
      setData({ ...d, items: [...data.items, ...d.items] });
      setPick((p) => ({ ...p, ...Object.fromEntries(d.items.map((it) => [it.id, it.candidates.length ? 0 : null])) }));
    } catch (e: any) {
      setError(e?.message || "Couldn't look up more photos.");
    } finally {
      setMore(false);
    }
  }

  // Saved a few at a time: each photo is fetched and stored, so one big request would crawl.
  async function save() {
    setSaving(true);
    setError("");
    let saved = 0;
    let failed = 0;
    try {
      const items = chosen.map((it) => {
        const c = it.candidates[pick[it.id] as number];
        return { id: it.id, url: c.url, credit: c.credit };
      });
      for (let i = 0; i < items.length; i += 8) {
        setProgress(`Saving ${Math.min(i + 8, items.length)} of ${items.length}…`);
        const r = await api<{ saved: number; failed: unknown[] }>("/products/photos/apply", { method: "POST", body: JSON.stringify({ items: items.slice(i, i + 8) }) });
        saved += r.saved;
        failed += r.failed.length;
      }
      refreshData();
      onDone?.(saved);
      if (failed) setError(`${saved} saved, ${failed} couldn't be downloaded — try those again.`);
      else onClose();
    } catch (e: any) {
      if (saved) { refreshData(); onDone?.(saved); }
      setError(`${saved ? `${saved} saved. ` : ""}${e?.message || "Couldn't save the photos."}`);
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title="Find photos" subtitle="Matched from each product's name. Check them, then keep the ones that look right.">
      <div className="space-y-4">
        <ErrorBanner message={error} />

        {loading && (
          <div className="flex items-center gap-3 py-10 justify-center text-t3 text-[13px]">
            <AiMark size={28} /> <Loader2 className="w-4 h-4 animate-spin" /> Looking up photos by name…
          </div>
        )}

        {!loading && data && data.items.length === 0 && (
          <div className="py-10 text-center text-[13px] text-t3">Every product already has a photo.</div>
        )}

        {!loading && data && data.items.length > 0 && (
          <>
            <div className="text-[12.5px] text-t3">
              Found a match for <b className="text-t1">{matched}</b> of {data.items.length} products
              {data.sources.length === 1 && " using free openly-licensed photos. Brand names often miss; adding a Pexels key on the server improves this a lot."}
            </div>
            <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1 space-y-2.5">
              {data.items.map((it) => {
                const sel = pick[it.id];
                return (
                  <div key={it.id} className="rounded-2xl border border-line bg-surface p-3">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <div className="text-[13px] font-bold text-t1 truncate">{it.name}</div>
                      <div className="text-[11.5px] text-t3 shrink-0">
                        {sel !== null && sel !== undefined ? "Tap the photo again to skip" : it.candidates.length ? "Skipped" : "No match found"}
                      </div>
                    </div>
                    {it.candidates.length === 0 ? (
                      <div className="flex items-center gap-2 text-[12px] text-t3"><ImageOff className="w-4 h-4" /> Nothing suitable — you can add one by hand from the product.</div>
                    ) : (
                      <div className="flex gap-2.5 flex-wrap">
                        {it.candidates.map((c, i) => {
                          const on = sel === i;
                          return (
                            <button
                              key={c.url}
                              type="button"
                              onClick={() => setPick((p) => ({ ...p, [it.id]: on ? null : i }))}
                              title={c.credit}
                              className={cn("relative w-24 h-24 rounded-xl overflow-hidden border-2 bg-surface-3 transition-all", on ? "border-primary shadow-e2" : "border-line opacity-70 hover:opacity-100")}
                            >
                              <img src={c.thumb} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-full h-full object-cover" />
                              {on && <span className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-full bg-primary text-white"><Check className="w-3 h-3" /></span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {sel !== null && sel !== undefined && it.candidates[sel] && (
                      <div className="mt-1.5 text-[11px] text-t4 truncate">{it.candidates[sel].credit}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {data.remaining > 0 && (
              <div className="flex items-center justify-between gap-3 text-[12px] text-t3">
                <span>{data.remaining} more product{data.remaining === 1 ? "" : "s"} without a photo.</span>
                <button onClick={loadMore} disabled={more || saving} className="font-bold text-primary hover:underline disabled:opacity-60 inline-flex items-center gap-1.5">
                  {more && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Find the next {Math.min(12, data.remaining)}
                </button>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={onClose} disabled={saving}>Not now</Button>
              <Button onClick={save} disabled={saving || chosen.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? progress || "Saving…" : `Use ${chosen.length} photo${chosen.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
