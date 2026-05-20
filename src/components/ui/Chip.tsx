import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import { Icon } from "./Icon";

export type ChipTone = "neutral" | "soft" | "accent" | "ok" | "warn" | "danger";
export type ChipSize = "sm" | "md" | "lg";

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  size?: ChipSize;
  /** Phosphor icon shown before the label. */
  icon?: string;
  /** Show a colored dot before the label. */
  dot?: boolean;
  className?: string;
}

const toneClasses: Record<ChipTone, { wrap: string; dot: string }> = {
  neutral: { wrap: "bg-surface2 text-text2 border-line", dot: "bg-muted-soft" },
  soft: { wrap: "bg-surface text-text2 border-line", dot: "bg-muted-soft" },
  accent: { wrap: "bg-accent-soft text-accent-ink border-accent-soft-strong", dot: "bg-accent" },
  ok: { wrap: "bg-ok-soft text-ok-ink border-[#A7F3D0]", dot: "bg-ok" },
  warn: { wrap: "bg-warn-soft text-warn-ink border-[#FDE68A]", dot: "bg-warn" },
  danger: { wrap: "bg-danger-soft text-[#991B1B] border-[#FECACA]", dot: "bg-danger" },
};

const sizeClasses: Record<ChipSize, { wrap: string; dot: string; iconSize: number }> = {
  sm: { wrap: "px-1.5 py-px text-[10.5px] gap-1", dot: "h-[5px] w-[5px]", iconSize: 10.5 },
  md: { wrap: "px-2 py-0.5 text-[11.5px] gap-1.5", dot: "h-1.5 w-1.5", iconSize: 11.5 },
  lg: { wrap: "px-2.5 py-1 text-[12px] gap-1.5", dot: "h-1.5 w-1.5", iconSize: 12 },
};

/**
 * Inline tag/badge. Mirrors `<Chip>` from hifi/tokens.jsx.
 * Use for status indicators, counts, filter pills.
 */
export const Chip = ({ children, tone = "neutral", size = "md", icon, dot, className }: ChipProps) => {
  const t = toneClasses[tone];
  const s = sizeClasses[size];
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border font-[550] leading-[1.4]",
        s.wrap,
        t.wrap,
        className,
      )}
    >
      {dot && <span className={cn("rounded-full flex-shrink-0", s.dot, t.dot)} />}
      {icon && <Icon name={icon} size={s.iconSize} />}
      {children}
    </span>
  );
};

export default Chip;
