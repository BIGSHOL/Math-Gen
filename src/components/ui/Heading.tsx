import { createElement, type ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export type HeadingLevel = "display" | "h1" | "h2" | "h3";

export interface HeadingProps {
  children: ReactNode;
  /** Type scale variant. Defaults to "h2". */
  level?: HeadingLevel;
  /** Subtitle rendered below in `text-small text-muted`. */
  sub?: ReactNode;
  /** Right-aligned slot for actions (buttons, filter chips). */
  right?: ReactNode;
  className?: string;
}

const levelMeta: Record<HeadingLevel, { tag: "h1" | "h2" | "h3"; cls: string }> = {
  display: { tag: "h1", cls: "text-display text-text" },
  h1: { tag: "h1", cls: "text-h1 text-text" },
  h2: { tag: "h2", cls: "text-h2 text-text" },
  h3: { tag: "h3", cls: "text-h3 text-text" },
};

/**
 * Section heading with optional subtitle and right-aligned actions slot.
 * Mirrors `<Heading>` from hifi/tokens.jsx.
 */
export const Heading = ({ children, level = "h2", sub, right, className }: HeadingProps) => {
  const { tag, cls } = levelMeta[level];
  return (
    <div className={cn("flex justify-between items-end gap-4", className)}>
      <div className="min-w-0">
        {createElement(
          tag,
          { className: cn("whitespace-nowrap", cls) },
          children,
        )}
        {sub && <div className="text-small text-muted mt-0.5 whitespace-nowrap">{sub}</div>}
      </div>
      {right && <div className="flex gap-1.5 items-center flex-shrink-0">{right}</div>}
    </div>
  );
};

export default Heading;
