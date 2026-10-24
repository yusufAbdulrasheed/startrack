import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { useSession } from "@/lib/session";

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long" }) : "");

/**
 * One line across the top when something needs the owner's attention: the plan
 * has ended (changes are paused), or the free trial is almost over. Silent otherwise.
 */
export function PlanBanner() {
  const { plan, can } = useSession();
  const owner = can("*");
  if (plan.legacy) return null;

  if (plan.lapsed) {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-danger text-white text-[13px] font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Your plan ended{plan.periodEnd ? ` on ${day(plan.periodEnd)}` : ""}. You can still view everything, but changes are paused.</span>
        {owner ? <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-white text-danger font-bold">Renew now</Link> : <span className="shrink-0 opacity-90">Ask the owner to renew</span>}
      </div>
    );
  }

  if (plan.trial && plan.periodEnd) {
    const left = Math.ceil((new Date(plan.periodEnd).getTime() - Date.now()) / 86_400_000);
    if (left > 5) return null;
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-warning-soft text-warning text-[13px] font-semibold border-b border-line">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Your free trial ends {left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`}. Pick a plan to keep going without a pause.</span>
        {owner && <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-warning text-white font-bold">Choose a plan</Link>}
      </div>
    );
  }
  return null;
}
