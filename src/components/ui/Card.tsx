import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Inner padding in pixels. Defaults to 16. */
  pad?: number;
  /** Adds a hover lift + shadow when true. */
  interactive?: boolean;
}

/**
 * Surface container with subtle border + shadow-s1. Mirrors `<Card>` from
 * hifi/tokens.jsx.
 *
 * Pass `interactive` to enable a 160ms hover lift (used for clickable cards
 * in the Library grid, variant history, etc.).
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, pad = 16, interactive, className, style, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface border border-line rounded-r4 shadow-s1",
        "transition-[box-shadow,transform,border-color] duration-[160ms] ease-out",
        interactive && [
          "cursor-pointer",
          "hover:shadow-s3 hover:-translate-y-px hover:border-line-strong",
          "focus-visible:outline-none focus-visible:shadow-accent-glow focus-visible:border-accent",
        ],
        className,
      )}
      style={{ padding: pad, ...style }}
      {...rest}
    >
      {children}
    </div>
  ),
);

Card.displayName = "Card";

export default Card;
