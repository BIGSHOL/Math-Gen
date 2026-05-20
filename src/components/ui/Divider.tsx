import { cn } from "@app/lib/tailwind";

export interface DividerProps {
  vertical?: boolean;
  className?: string;
}

/**
 * Hairline separator. Horizontal by default; pass `vertical` for column
 * separators (height 100% of parent).
 */
export const Divider = ({ vertical, className }: DividerProps) => (
  <div
    className={cn("bg-line", vertical ? "w-px h-full" : "h-px w-full", className)}
    role="separator"
    aria-orientation={vertical ? "vertical" : "horizontal"}
  />
);

export default Divider;
