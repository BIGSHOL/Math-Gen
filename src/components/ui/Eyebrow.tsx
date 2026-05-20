import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import { Icon } from "./Icon";

export interface EyebrowProps {
  children: ReactNode;
  /** Phosphor icon shown before the text. */
  icon?: string;
  className?: string;
}

/**
 * Tiny uppercase label used above section headings ("KEY METRICS", "RECENT
 * ACTIVITY"). Mirrors `<Eyebrow>` from hifi/tokens.jsx.
 */
export const Eyebrow = ({ children, icon, className }: EyebrowProps) => (
  <div
    className={cn(
      "text-micro uppercase text-muted flex items-center gap-1.5 whitespace-nowrap",
      className,
    )}
  >
    {icon && <Icon name={icon} size={11} />}
    {children}
  </div>
);

export default Eyebrow;
