import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export type ProgressTone = "accent" | "ok" | "warn";

export interface ProgressProps {
  value: number;
  max?: number;
  tone?: ProgressTone;
  /** Track height in pixels. Defaults to 4. */
  height?: number;
  /** Label rendered above the bar (typically left=name, right=count). */
  label?: ReactNode;
  className?: string;
}

const toneBg: Record<ProgressTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
};

/**
 * Horizontal progress bar with a 500ms spring width animation. Mirrors
 * `<Progress>` from hifi/tokens.jsx. The label slot is a flex row so callers
 * can place caption + count on opposite sides.
 */
export const Progress = ({
  value,
  max = 100,
  tone = "accent",
  height = 4,
  label,
  className,
}: ProgressProps) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="flex justify-between mb-1.5 text-small">
          {label}
        </div>
      )}
      <div
        className="bg-surface3 overflow-hidden"
        style={{ height, borderRadius: height }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn("h-full transition-[width] duration-[500ms] ease-spring", toneBg[tone])}
          style={{ width: `${pct}%`, borderRadius: height }}
        />
      </div>
    </div>
  );
};

export default Progress;
