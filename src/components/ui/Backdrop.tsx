import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export interface BackdropProps {
  children?: ReactNode;
  /** Called when the backdrop (not its children) is clicked — typically closes the modal. */
  onClick?: MouseEventHandler<HTMLDivElement>;
  className?: string;
}

/**
 * Fullscreen dim + blur layer for modals/sheets. Use as the outer wrapper of
 * any modal — children sit on top of the dimmed background.
 *
 * The 220ms `backdrop-fade` keyframe runs on mount. Click events bubble from
 * the backdrop itself; stop propagation on child wrappers so clicks *inside*
 * the modal don't dismiss it.
 */
export const Backdrop = ({ children, onClick, className }: BackdropProps) => (
  <div
    onClick={onClick}
    className={cn(
      "fixed inset-0 z-50 grid place-items-center",
      "bg-ink/40 backdrop-blur-[4px]",
      "animate-backdrop-fade",
      className,
    )}
  >
    {children}
  </div>
);

export default Backdrop;
