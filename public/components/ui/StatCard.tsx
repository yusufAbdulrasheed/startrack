import { useId } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Card } from "./Card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  delta,
  trend,
  icon: Icon,
  spark,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  icon: LucideIcon;
  spark?: number[];
  index?: number;
}) {
  // Unique per instance — index alone collides whenever two cards share the
  // same (often default) index, which silently breaks every sparkline fill
  // but the first.
  const gradientId = `spark-${useId()}`;
  const sparkData = (spark ?? []).map((v, i) => ({ i, v }));
  const up = trend === "up";
  return (
    <Card
      interactive
      className="p-4 relative overflow-hidden animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-t3 truncate">{label}</div>
        <div className="w-9 h-9 shrink-0 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <div className="mt-3 text-[22px] leading-none font-bold font-mono text-t1 tabular-nums truncate">{value}</div>
      {delta && (
        <div
          className={cn(
            "mt-1.5 inline-flex items-center gap-0.5 text-[12px] font-semibold",
            up ? "text-success" : "text-danger"
          )}
        >
          {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          {delta}
        </div>
      )}
      {sparkData.length > 1 && (
        <div className="h-8 -mx-1 mt-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--st-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--st-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--st-primary)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
