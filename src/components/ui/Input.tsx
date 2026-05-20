import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@app/lib/tailwind";

export type InputSize = "sm" | "md";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: ReactNode;
  /** Visual size (NOT the same as the native `size` attribute). */
  size?: InputSize;
  /** Content rendered inside the field on the left (e.g. unit, icon). */
  prefix?: ReactNode;
  /** Content rendered inside the field on the right (e.g. unit, action). */
  suffix?: ReactNode;
  /** Use a monospace font (useful for filenames, codes, keys). */
  mono?: boolean;
  /** Wrapper class — applied to the outer `<div>`, not the input itself. */
  wrapperClassName?: string;
}

const sizeClasses: Record<InputSize, { wrap: string; text: string }> = {
  sm: { wrap: "h-7 px-2.5", text: "text-[12px]" },
  md: { wrap: "h-[34px] px-3", text: "text-[13px]" },
};

/**
 * Form text input with optional label, prefix, and suffix. Focus state
 * applies an accent border + accent-glow ring (matches hifi/tokens.jsx).
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, size = "md", prefix, suffix, mono, className, wrapperClassName, onFocus, onBlur, ...rest },
    ref,
  ) => {
    const [focus, setFocus] = useState(false);
    const s = sizeClasses[size];
    return (
      <div className={cn("flex flex-col gap-1.5", wrapperClassName)}>
        {label && <div className="text-caption text-text2">{label}</div>}
        <div
          className={cn(
            "flex items-center gap-2 rounded-r2 bg-surface border transition-all duration-[140ms] ease-out",
            focus ? "border-accent shadow-accent-glow" : "border-line-strong",
            s.wrap,
            s.text,
            mono && "font-mono",
            className,
          )}
        >
          {prefix && <span className="text-muted text-[12px] flex-shrink-0">{prefix}</span>}
          <input
            ref={ref}
            onFocus={(e) => {
              setFocus(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocus(false);
              onBlur?.(e);
            }}
            className={cn(
              "flex-1 min-w-0 border-none outline-none bg-transparent text-text placeholder:text-muted",
              "font-inherit",
            )}
            {...rest}
          />
          {suffix && <span className="text-muted text-[12px] flex-shrink-0">{suffix}</span>}
        </div>
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
