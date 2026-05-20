import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export interface TopBarProps {
  /** Left slot — typically Logo + breadcrumb. */
  left?: ReactNode;
  /** Right slot — actions, search, avatar. */
  right?: ReactNode;
  className?: string;
}

/**
 * 52px fixed app bar with surface background and bottom border. Slot pattern
 * so callers control content. Mirrors `<TopBar>` from hifi/tokens.jsx.
 */
export const TopBar = ({ left, right, className }: TopBarProps) => (
  <div
    className={cn(
      "h-[52px] px-5 bg-surface border-b border-line flex-shrink-0",
      "flex items-center justify-between",
      className,
    )}
  >
    <div className="flex items-center gap-[14px] min-w-0">{left}</div>
    <div className="flex items-center gap-2">{right}</div>
  </div>
);

export default TopBar;
