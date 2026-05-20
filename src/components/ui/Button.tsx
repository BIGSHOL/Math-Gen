import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import { Icon, type IconWeight } from "./Icon";

export type BtnKind = "primary" | "accent" | "secondary" | "ghost" | "soft" | "softWarn" | "danger";
export type BtnSize = "xs" | "sm" | "md" | "lg";

export interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children?: ReactNode;
  kind?: BtnKind;
  size?: BtnSize;
  /** Phosphor icon name shown to the left of the label. */
  icon?: string;
  /** Phosphor icon name shown to the right of the label. */
  iconRight?: string;
  /** Stretch to fill container width. */
  full?: boolean;
}

const sizeClasses: Record<BtnSize, string> = {
  xs: "h-6 px-2 text-[11.5px] gap-1",
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-1.5",
  lg: "h-10 px-4 text-[14px] gap-2",
};

const iconSizes: Record<BtnSize, number> = { xs: 12, sm: 13, md: 14, lg: 16 };

const kindClasses: Record<BtnKind, string> = {
  primary:
    "bg-ink text-white border border-ink shadow-s1 hover:bg-black",
  accent:
    "bg-accent text-white border border-accent shadow-s1 hover:bg-accent-hover",
  secondary:
    "bg-surface text-text border border-line-strong shadow-s1 hover:bg-hover",
  ghost:
    "bg-transparent text-text2 border border-transparent hover:bg-hover",
  soft:
    "bg-accent-soft text-accent-ink border border-accent-soft hover:bg-accent-soft-strong",
  softWarn:
    "bg-warn-soft text-warn-ink border border-warn-soft hover:bg-[#FDE68A]",
  danger:
    "bg-surface text-danger border border-[#FEE2E2] hover:bg-danger-soft",
};

/**
 * Primary action button. Mirrors `<Btn>` from hifi/tokens.jsx.
 *
 * - 7 kinds (primary/accent/secondary/ghost/soft/softWarn/danger)
 * - 4 sizes (xs/sm/md/lg)
 * - Optional left/right Phosphor icon
 * - Subtle `translateY(-0.5px)` lift on hover (when not disabled)
 */
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  ({ children, kind = "secondary", size = "md", icon, iconRight, full, className, disabled, ...rest }, ref) => {
    const iconWeight: IconWeight = kind === "primary" || kind === "accent" ? "bold" : "regular";
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-r2 box-border font-[550] leading-none",
          "transition-[background,transform,box-shadow] duration-[120ms] ease-out",
          "hover:-translate-y-[0.5px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
          "focus-visible:outline-none focus-visible:shadow-accent-glow",
          full && "w-full",
          sizeClasses[size],
          kindClasses[kind],
          className,
        )}
        {...rest}
      >
        {icon && <Icon name={icon} size={iconSizes[size]} weight={iconWeight} />}
        {children}
        {iconRight && <Icon name={iconRight} size={iconSizes[size]} weight={iconWeight} />}
      </button>
    );
  },
);

Btn.displayName = "Btn";

export default Btn;
