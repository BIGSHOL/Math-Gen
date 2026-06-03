import { cn } from "@app/lib/tailwind";
import { Icon } from "./Icon";

export type SegmentedSize = "sm" | "md";

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
  /** Phosphor icon shown before the label. */
  icon?: string;
  /** 비활성 — 선택 불가 (회색 + cursor-not-allowed + 클릭 차단). */
  disabled?: boolean;
  /** hover 툴팁 (예: 비활성 사유 "준비 중"). */
  title?: string;
}

export interface SegmentedProps<T extends string = string> {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  size?: SegmentedSize;
  /** Stretch to fill container width and distribute options evenly. */
  full?: boolean;
  className?: string;
}

const sizeMap: Record<SegmentedSize, { btn: string; text: string; iconSize: number }> = {
  sm: { btn: "h-[26px] px-2.5", text: "text-[11.5px]", iconSize: 11.5 },
  md: { btn: "h-[30px] px-3", text: "text-[12.5px]", iconSize: 12.5 },
};

/**
 * Radio-group style multi-option selector. Active segment lifts onto a white
 * card with shadow-s1. Mirrors `<Segmented>` from hifi/tokens.jsx.
 */
export const Segmented = <T extends string = string>({
  value,
  onChange,
  options,
  size = "md",
  full,
  className,
}: SegmentedProps<T>) => {
  const s = sizeMap[size];
  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex p-[3px] gap-[2px] bg-surface2 rounded-r2",
        full && "w-full",
        className,
      )}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        const disabled = Boolean(opt.disabled);
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            title={opt.title}
            onClick={() => {
              if (!disabled) onChange(opt.value);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-r1 border-none",
              "transition-all duration-[120ms] ease-out",
              "focus-visible:outline-none focus-visible:shadow-accent-glow",
              full ? "flex-1" : "flex-none",
              s.btn,
              s.text,
              on
                ? "bg-surface text-text font-semibold shadow-s1"
                : "bg-transparent text-muted font-medium",
              disabled && "opacity-40 cursor-not-allowed",
            )}
          >
            {opt.icon && <Icon name={opt.icon} size={s.iconSize} weight={on ? "bold" : "regular"} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export default Segmented;
