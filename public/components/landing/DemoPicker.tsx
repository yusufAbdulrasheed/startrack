import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Blinds, BedDouble, Droplets, Egg, RefreshCw, Search, Smartphone, Sparkles, Store, UtensilsCrossed } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type DemoShop = {
  key: string; label: string; group: string; depth: "full" | "catalog"; pending: string;
  blurb: string; business: string; highlight: string; products: number;
};

const SHOP_ICON: Record<string, any> = {
  blinds: Blinds, electronics: Smartphone, hotel: BedDouble,
  restaurant: UtensilsCrossed, water: Droplets, poultry: Egg,
};

/**
 * Choosing the trade before the sandbox is built. A pharmacist landing in a
 * supermarket learns nothing about whether StarTrack suits them — the demo is
 * only persuasive if it speaks their vocabulary from the first screen.
 *
 * Shops whose trade-specific workflow is still being built say so on the card
 * rather than letting someone find out by looking for a feature that isn't
 * there yet.
 */
export function DemoPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { demoLogin } = useSession();
  const navigate = useNavigate();
  const [shops, setShops] = useState<DemoShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    setQ("");
    api<{ shops: DemoShop[] }>("/auth/demo/shops")
      .then((r) => setShops(r.shops))
      .catch(() => setError("Couldn't load the demo shops. Try again in a moment."))
      .finally(() => setLoading(false));
  }, [open]);

  async function start(key: string) {
    setStarting(key);
    setError("");
    try {
      await demoLogin(key);
      navigate("/app/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not start the demo");
      setStarting(null);
    }
  }

  const term = q.trim().toLowerCase();
  const matches = term
    ? shops.filter((s) =>
        [s.label, s.business, s.blurb, s.group].some((f) => f.toLowerCase().includes(term))
      )
    : shops;

  // Keep the server's grouping, but only for groups that still have matches.
  const groups = matches.reduce<Record<string, DemoShop[]>>((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      onClose={starting ? () => {} : onClose}
      title="Which shop would you like to try?"
      subtitle="Each one is stocked with a week of real trading. Sell, void, approve a return — it resets in 24 hours."
      wide
    >
      {error && <div className="mb-3 px-3 py-2.5 rounded-ctl bg-danger-soft text-danger text-[12px] font-semibold">{error}</div>}

      {!loading && shops.length > 6 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-t4 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${shops.length} trades — blinds, poultry, hotel…`}
            className="w-full h-10 pl-9 pr-3 rounded-ctl bg-surface-2 border border-line text-[13px] text-t1 placeholder:text-t4 focus:outline-none focus:border-brand-500"
          />
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : matches.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-t3">No trade matches “{q}”.</div>
      ) : (
        <div className="-mx-1 px-1 space-y-5">
          {Object.entries(groups).map(([group, list]) => (
            <div key={group}>
              <div className="text-[11.5px] font-medium tracking-[0.1em] text-t4 mb-2">{group}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {list.map((s) => {
                  const Icon = SHOP_ICON[s.key] || Store;
                  const busy = starting === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => start(s.key)}
                      disabled={!!starting}
                      className={cn(
                        "group text-left rounded-card border p-3.5 transition-all disabled:opacity-50",
                        busy ? "border-brand-400 bg-primary-softer" : "border-line bg-surface hover:border-brand-400 hover:shadow-e1"
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                          <Icon className="w-[18px] h-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13.5px] font-semibold text-t1 truncate">{s.label}</span>
                            {s.depth === "catalog" && (
                              <span className="shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded bg-warning-soft text-warning">
                                Catalog
                              </span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-t3 truncate">{s.business}</div>
                        </div>
                        {busy && <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />}
                      </div>
                      <p className="mt-2 text-[12px] text-t2 leading-snug">{s.blurb}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-t3">
                        <Sparkles className="w-3 h-3 text-primary shrink-0" />
                        <span className="truncate">{s.highlight}</span>
                      </div>
                      {s.pending && (
                        <p className="mt-2 pt-2 border-t border-line text-[10.5px] text-t4 leading-snug">{s.pending}</p>
                      )}
                      <div className="mt-1.5 text-[10.5px] text-t4">{s.products} products ready to sell</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-t4 text-center">
        No sign-up, no card. Everything you do stays in your own sandbox and disappears after 24 hours.
      </p>
    </Modal>
  );
}

/** Opens the shop picker: the visitor chooses the trade, then the sandbox is built for it. */
export function DemoButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{children}</button>
      <DemoPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
