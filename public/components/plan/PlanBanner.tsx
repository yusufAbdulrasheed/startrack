import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, X } from "lucide-react";
import { useSession } from "@/lib/session";

const TRIAL_ENDED_KEY = "startrack.trialEnded.dismissed";
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "long" }) : "");

/**
 * One line across the top when something needs the owner's attention: the plan
 * has ended (changes are paused), or the free trial is almost over. Silent otherwise.
 */
export function PlanBanner() {
  const { plan, can } = useSession();
  const owner = can("*");
  const [gone, setGone] = useState(() => { try { return localStorage.getItem(TRIAL_ENDED_KEY) === "1"; } catch { return false; } });
  if (plan.legacy) return null;

  if (plan.awaitingPayment) {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-warning text-white text-[13px] font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Your account is ready. Make your first payment to start; until then you can look around but not make changes.</span>
        {owner ? <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-white text-warning font-bold">Pay now</Link> : <span className="shrink-0 opacity-90">Ask the owner to pay.</span>}
      </div>
    );
  }

  if (plan.lapsed) {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-danger text-white text-[13px] font-semibold">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Your plan ended{plan.periodEnd ? ` on ${day(plan.periodEnd)}` : ""}. You can still view everything, but changes are paused.</span>
        {owner ? <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-white text-danger font-bold">Renew now</Link> : <span className="shrink-0 opacity-90">Ask the owner to renew.</span>}
      </div>
    );
  }

  // The trial is over and the account carries on as Freemium: say so once.
  if (plan.trialEnded && !gone) {
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-primary-soft text-primary text-[13px] font-semibold border-b border-line">
        <Clock className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">Your free Pro days are over and you're on Freemium, the plan you paid for. Everything you entered is still here; Pro features are paused and Freemium limits apply.</span>
        <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-primary text-white font-bold">See what changed</Link>
        <button onClick={() => { try { localStorage.setItem(TRIAL_ENDED_KEY, "1"); } catch { /* ignore */ } setGone(true); }} aria-label="Dismiss" className="shrink-0 p-1 opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  if (plan.trial && plan.periodEnd) {
    const left = Math.ceil((new Date(plan.periodEnd).getTime() - Date.now()) / 86_400_000);
    if (left > 5) return null;
    const when = left <= 0 ? "today" : left === 1 ? "tomorrow" : `in ${left} days`;
    return (
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-warning-soft text-warning text-[13px] font-semibold border-b border-line">
        <Clock className="w-4 h-4 shrink-0" />
        {plan.paymentsOn
          ? <span className="flex-1 min-w-0">Your free {plan.name} days end {when}{plan.paidUntil && plan.paidPlan ? `, then you carry on with ${plan.paidPlan === "free" ? "Freemium" : plan.paidPlan}, paid until ${day(plan.paidUntil)}` : ""}. Upgrade any time to keep {plan.name}.</span>
          : <span className="flex-1 min-w-0">Your free {plan.name} trial ends {when}, then you continue free on Freemium. Nothing is deleted.</span>}
        {owner && <Link to="/app/billing" className="shrink-0 px-3.5 h-8 inline-flex items-center rounded-full bg-warning text-white font-bold">{plan.paymentsOn ? "Keep " + plan.name : "What changes?"}</Link>}
      </div>
    );
  }
  return null;
}
