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
  const sparkData = (spark ?? []).map((v, i) => ({ i, v }));
  const up = trend === "up";
  return (
    <Card
      interactive
      className="p-5 relative overflow-hidden animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-md",
              up ? "text-success bg-success-soft" : "text-danger bg-danger-soft"
            )}
          >
            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {delta}
          </span>
        )}
      </div>
      <div className="mt-4 text-[26px] leading-none font-bold font-mono text-t1 tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] font-medium text-t3">{label}</div>
      {sparkData.length > 1 && (
        <div className="h-9 -mx-1 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
              <defs>
                <linearGradient id={`spark${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--st-primary)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--st-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="var(--st-primary)"
                strokeWidth={2}
                fill={`url(#spark${index})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
