import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import { Card } from "./Card";
import { Chip, type ChipTone } from "./Chip";
import { Icon } from "./Icon";

export type StatCardTone = "accent" | "ok" | "warn";

export interface StatCardProps {
  /** Phosphor icon name shown in the tinted square. */
  icon: string;
  label: ReactNode;
  value: ReactNode;
  /** Optional unit suffix shown after the value (e.g. "%", "건"). */
  unit?: ReactNode;
  /** Optional trend chip rendered top-right. */
  trend?: ReactNode;
  trendTone?: ChipTone;
  /** Tint of the icon square. Defaults to "accent". */
  tone?: StatCardTone;
  className?: string;
}

const toneClasses: Record<StatCardTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent",
};

/**
 * 4-up dashboard tile: tinted icon square, label, large mono value, optional
 * unit + trend chip. Mirrors `<StatCard>` from hifi/tokens.jsx.
 */
export const StatCard = ({
  icon,
  label,
  value,
  unit,
  trend,
  trendTone = "ok",
  tone = "accent",
  className,
}: StatCardProps) => (
  <Card className={className}>
    <div className="flex justify-between items-start mb-3.5">
      <div className={cn("w-7 h-7 rounded-r2 grid place-items-center", toneClasses[tone])}>
        <Icon name={icon} size={15} weight="bold" />
      </div>
      {trend && (
        <Chip tone={trendTone} size="sm">
          {trend}
        </Chip>
      )}
    </div>
    <div className="text-caption text-muted mb-1 whitespace-nowrap">{label}</div>
    <div className="flex items-baseline gap-1 flex-wrap">
      <span className="text-[26px] font-bold text-text font-mono tracking-[-0.02em] whitespace-nowrap">
        {value}
      </span>
      {unit && <span className="text-small text-muted whitespace-nowrap">{unit}</span>}
    </div>
  </Card>
);

export default StatCard;
