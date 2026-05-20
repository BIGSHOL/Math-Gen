import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/**
 * Keyboard shortcut hint, e.g. <Kbd>⌘K</Kbd>, <Kbd>Esc</Kbd>.
 * Mirrors `<Kbd>` from hifi/tokens.jsx — monospace, raised lower border.
 */
export const Kbd = ({ children, className }: KbdProps) => (
  <kbd
    className={cn(
      "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5",
      "bg-surface2 border border-line border-b-2 rounded",
      "font-mono text-[10px] font-semibold text-text2",
      className,
    )}
  >
    {children}
  </kbd>
);

export default Kbd;
