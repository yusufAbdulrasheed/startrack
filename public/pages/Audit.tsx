import { ScrollText, Tag, Undo2, UserCog, Settings as SettingsIcon, Ban, Boxes, MapPin } from "lucide-react";
import { Badge, Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/EmptyState";
import { useApi } from "@/lib/useApi";
import { usePaged, Pager } from "@/components/ui/Pager";
import { fmtDateTime } from "@/lib/format";

type Entry = {
  id: string; actorName: string; action: string;
  target: { type: string; label: string };
  before?: any; after?: any; at: string;
};

const ACTION_META: Record<string, { label: string; icon: any; tone: "brand" | "success" | "warning" | "danger" | "neutral" }> = {
  "product.create": { label: "Product added", icon: Boxes, tone: "success" },
  "product.price_change": { label: "Price changed", icon: Tag, tone: "warning" },
  "product.archive": { label: "Product archived", icon: Boxes, tone: "neutral" },
  "sale.void": { label: "Sale voided", icon: Ban, tone: "danger" },
  "return.approve": { label: "Return approved", icon: Undo2, tone: "brand" },
  "return.reject": { label: "Return rejected", icon: Undo2, tone: "danger" },
  "staff.create": { label: "Staff added", icon: UserCog, tone: "success" },
  "staff.update": { label: "Staff changed", icon: UserCog, tone: "warning" },
  "staff.pin_reset": { label: "PIN reset", icon: UserCog, tone: "warning" },
  "settings.update": { label: "Settings changed", icon: SettingsIcon, tone: "neutral" },
  "branch.create": { label: "Branch added", icon: MapPin, tone: "success" },
  "stock.adjust": { label: "Stock adjusted", icon: Boxes, tone: "warning" },
  "stock.transfer": { label: "Stock transferred", icon: Boxes, tone: "brand" },
  "expense.delete": { label: "Expense deleted", icon: Ban, tone: "danger" },
};

function describe(e: Entry): string {
  if (e.action === "product.price_change" && e.before && e.after) {
    const bits = [];
    if (e.before.price !== e.after.price) bits.push(`price ${e.before.price} → ${e.after.price}`);
    if (e.before.cost !== e.after.cost) bits.push(`cost ${e.before.cost} → ${e.after.cost}`);
    return bits.join(", ");
  }
  if (e.action === "sale.void") return e.after?.reason ? `"${e.after.reason}"` : "";
  if (e.action === "staff.update" && e.before && e.after) {
    const bits = [];
    if (e.before.role !== e.after.role) bits.push(`role ${e.before.role} → ${e.after.role}`);
    if (e.before.status !== e.after.status) bits.push(`${e.after.status === "inactive" ? "suspended" : "restored"}`);
    return bits.join(", ");
  }
  if (e.action === "stock.adjust" && e.before && e.after) return `${e.before.stock} → ${e.after.stock} ("${e.after.reason}")`;
  return "";
}

export function Audit() {
  const { data, loading } = useApi<{ entries: Entry[] }>("/audit?limit=100", []);
  const entries = data?.entries || [];
  const paged = usePaged(entries);

  return (
    <div className="p-6 lg:p-8 max-w-[900px] mx-auto">
      <PageHeader title="Audit Log" subtitle="Every sensitive action, on the record — newest first" />
      {loading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState icon={ScrollText} title="Nothing logged yet" body="Price changes, voids, PIN resets, settings edits — they all leave a trace here." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {paged.rows.map((e) => {
              const meta = ACTION_META[e.action] || { label: e.action, icon: ScrollText, tone: "neutral" as const };
              const Icon = meta.icon;
              const detail = describe(e);
              return (
                <div key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-3 text-t2 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {e.target?.label && <span className="text-[13px] font-semibold text-t1">{e.target.label}</span>}
                    </div>
                    {detail && <div className="text-[12px] text-t2 mt-0.5">{detail}</div>}
                    <div className="text-[11px] text-t4 mt-0.5">{e.actorName} · {fmtDateTime(e.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <Pager {...paged} onPage={paged.setPage} noun="entries" />
        </Card>
      )}
    </div>
  );
}
