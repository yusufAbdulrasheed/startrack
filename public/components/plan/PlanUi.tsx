import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/lib/session";
import { FEATURES, PLANS, requiredPlanFor, type PlanKey } from "#shared/plans.js";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLAN_TONE: Record<PlanKey, string> = {
  free: "bg-surface-3 text-t2",
  pro: "bg-primary-soft text-primary",
  business: "bg-[#1b1e3a] text-white",
};

/** Opens the same upgrade prompt the server's refusals do, for a button the plan doesn't unlock. */
export function requestUpgrade(feature: string) {
  const f = FEATURES[feature as keyof typeof FEATURES];
  const need = requiredPlanFor(feature);
  window.dispatchEvent(new CustomEvent("st:plan", { detail: { requiredPlan: need, message: `${f?.label || "This feature"} is part of the ${PLANS[need].name} plan. Upgrade to use it.` } }));
}

/** A tiny "Pro" / "Business" tag, for things you can see but not yet use. */
export function PlanChip({ plan, className }: { plan: PlanKey; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 px-1.5 py-[2px] rounded-md text-[10px] font-bold uppercase tracking-wide leading-none", PLAN_TONE[plan], className)}>{PLANS[plan].name}</span>;
}

/** Tag for a feature that this account's plan doesn't include; nothing when it does. */
export function LockChip({ feature, className }: { feature: string; className?: string }) {
  const { hasFeature } = useSession();
  if (hasFeature(feature)) return null;
  return <PlanChip plan={requiredPlanFor(feature)} className={className} />;
}

/**
 * Listens for the server saying "your plan doesn't include that" (see api.ts)
 * and offers the upgrade, whichever screen asked. Mounted once in the app shell.
 */
export function UpgradePrompt() {
  const navigate = useNavigate();
  const { can } = useSession();
  const [info, setInfo] = useState<{ message: string; requiredPlan: PlanKey; lapsed?: boolean } | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setInfo({ message: d.message || "That's not part of your plan.", requiredPlan: (d.requiredPlan as PlanKey) || "pro", lapsed: !!d.lapsed });
    };
    window.addEventListener("st:plan", on);
    return () => window.removeEventListener("st:plan", on);
  }, []);

  if (!info) return null;
  const plan = PLANS[info.requiredPlan] || PLANS.pro;
  const close = () => setInfo(null);
  if (info.lapsed) {
    return (
      <Modal open onClose={close} title="Renew your plan" subtitle="Your data is safe. Changes are paused until you renew.">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-danger-soft px-4 py-3.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-danger text-white shrink-0"><Lock className="w-4 h-4" /></span>
            <p className="text-[13.5px] leading-relaxed text-t1">{info.message}</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Not now</Button>
            {can("*") ? <Button onClick={() => { close(); navigate("/app/billing"); }}>Renew <ArrowRight className="w-4 h-4" /></Button>
              : <span className="text-[12px] text-t3 self-center">Ask the account owner to renew.</span>}
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open onClose={close} title={`Upgrade to ${plan.name}`} subtitle={plan.tagline}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-xl bg-primary-softer border border-line px-4 py-3.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl text-white shrink-0" style={{ background: "var(--st-gradient-primary)" }}><Lock className="w-4 h-4" /></span>
          <p className="text-[13.5px] leading-relaxed text-t1">{info.message}</p>
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
          {plan.highlights.slice(1, 7).map((h) => (
            <li key={h} className="flex items-start gap-2 text-[12.5px] text-t2"><Check className="w-3.5 h-3.5 mt-0.5 text-success shrink-0" /> {h}</li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-[13px] text-t3"><b className="text-t1 text-[16px]">{fmtMoney(plan.price, "₦")}</b> / month</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close}>Not now</Button>
            {can("*") ? <Button onClick={() => { close(); navigate(`/app/billing?plan=${info.requiredPlan}`); }}>See plans <ArrowRight className="w-4 h-4" /></Button>
              : <span className="text-[12px] text-t3 self-center max-w-[170px]">Ask the account owner to upgrade.</span>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** What a locked screen shows instead of the screen. */
export function LockedPage({ feature }: { feature: string }) {
  const navigate = useNavigate();
  const { can, plan: current } = useSession();
  const f = FEATURES[feature as keyof typeof FEATURES];
  const need = PLANS[requiredPlanFor(feature)];
  return (
    <div className="p-6 lg:p-10 max-w-[760px] mx-auto">
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface shadow-e2 px-7 py-12 sm:px-12 text-center">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full opacity-[0.07]" style={{ background: "var(--st-gradient-primary)" }} />
        <div className="relative">
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl text-white" style={{ background: "var(--st-gradient-primary)", boxShadow: "0 18px 30px -14px rgba(53,56,240,0.7)" }}>
            <Lock className="w-7 h-7" strokeWidth={1.8} />
          </span>
          <div className="mt-5 flex justify-center"><PlanChip plan={need.key} /></div>
          <h1 className="mt-3 text-[26px] sm:text-[30px] font-extrabold tracking-[-0.02em] text-t1">{f?.label || "This feature"} is on the {need.name} plan</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-t3 max-w-[480px] mx-auto">{f?.blurb}</p>
          <p className="mt-2 text-[13px] text-t4">You're on {current.name}.</p>
          <div className="mt-7 flex flex-wrap gap-3 justify-center">
            {can("*")
              ? <Button size="lg" onClick={() => navigate(`/app/billing?plan=${need.key}`)}><Sparkles className="w-4 h-4" /> Upgrade to {need.name} · {fmtMoney(need.price, "₦")}/mo</Button>
              : <span className="text-[13px] text-t3">Ask the account owner to upgrade the plan.</span>}
            <Button size="lg" variant="secondary" onClick={() => navigate("/app/dashboard")}>Back to dashboard</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shows the screen if the plan includes it, otherwise the upgrade page. */
export function FeatureGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { hasFeature } = useSession();
  return hasFeature(feature) ? <>{children}</> : <LockedPage feature={feature} />;
}
