import type { ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export type ToggleSize = "sm" | "md";

export interface ToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  size?: ToggleSize;
  disabled?: boolean;
  className?: string;
  /** Accessible label when `label` is not visible (icon-only toggle). */
  "aria-label"?: string;
}

const sizeMap: Record<ToggleSize, { track: string; knob: string; knobOn: string; knobOff: string }> = {
  sm: { track: "w-7 h-4", knob: "w-3 h-3", knobOn: "left-[14px]", knobOff: "left-[2px]" },
  md: { track: "w-[34px] h-5", knob: "w-4 h-4", knobOn: "left-4", knobOff: "left-[2px]" },
};

/**
 * Switch-style boolean toggle with 180ms spring animation. Mirrors `<Toggle>`
 * from hifi/tokens.jsx. Pair with `label`/`hint` for descriptive rows.
 */
export const Toggle = ({
  value,
  onChange,
  label,
  hint,
  size = "md",
  disabled,
  className,
  "aria-label": ariaLabel,
}: ToggleProps) => {
  const s = sizeMap[size];
  return (
    <label
      className={cn(
        "flex items-center gap-3",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative flex-shrink-0 rounded-full transition-colors duration-[180ms] ease-out",
          "focus-visible:outline-none focus-visible:shadow-accent-glow",
          s.track,
          value ? "bg-accent" : "bg-surface3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]",
            "transition-[left] duration-[180ms] ease-spring-bounce",
            s.knob,
            value ? s.knobOn : s.knobOff,
          )}
        />
      </button>
      {label && (
        <div>
          <div className="text-body text-text">{label}</div>
          {hint && <div className="text-small text-muted mt-px">{hint}</div>}
        </div>
      )}
    </label>
  );
};

export default Toggle;
