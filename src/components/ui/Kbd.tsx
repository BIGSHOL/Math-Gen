import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import { modKey } from "@app/lib/platform";

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

/**
 * OS-aware modifier 키 표시 — Mac 은 `⌘`, Windows/Linux 는 `Ctrl`.
 * 사용자 보고: ⌘ 만 박혀 있어서 Windows 사용자가 헷갈림.
 *
 * 사용:
 *   <ModKey /> <Kbd>K</Kbd>  →  Mac: ⌘ K, Windows: Ctrl K
 */
export const ModKey = ({ className }: { className?: string }) => (
  <Kbd className={className}>{modKey()}</Kbd>
);

export default Kbd;
