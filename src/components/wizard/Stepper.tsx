import { Icon } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";
import type { WizardStepIndex } from "@app/stores/wizardStore";

export interface StepperStep {
  index: WizardStepIndex;
  label: string;
  subLabel?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  current: WizardStepIndex;
  onJump?: (index: WizardStepIndex) => void;
}

/**
 * 5-step horizontal stepper. States per step:
 *   - done   → ink fill + check icon
 *   - active → accent border + accent number
 *   - future → muted number + dashed border
 *
 * The connector line between steps animates from 0 → 100% as you progress
 * (280ms ease). Clicking a `done` step jumps back to it.
 */
export const Stepper = ({ steps, current, onJump }: StepperProps) => (
  <ol className="flex items-center w-full" role="list">
    {steps.map((s, i) => {
      const state: "done" | "active" | "future" =
        s.index < current ? "done" : s.index === current ? "active" : "future";
      const isLast = i === steps.length - 1;
      const canJump = state === "done" && !!onJump;
      return (
        <li key={s.index} className="flex items-center flex-1 last:flex-none">
          <button
            type="button"
            disabled={!canJump}
            onClick={() => canJump && onJump(s.index)}
            className={cn(
              "flex items-center gap-2.5 group min-w-0",
              canJump && "cursor-pointer",
              !canJump && "cursor-default",
            )}
          >
            <span
              className={cn(
                "w-7 h-7 rounded-full grid place-items-center flex-shrink-0 text-[12px] font-bold font-mono",
                "transition-all duration-[220ms] ease-spring",
                state === "done" && "bg-ink text-white border border-ink",
                state === "active" &&
                  "bg-white text-accent border-2 border-accent shadow-accent-glow",
                state === "future" && "bg-surface text-muted border border-dashed border-line-strong",
              )}
            >
              {state === "done" ? (
                <Icon name="check" size={14} weight="bold" color="white" />
              ) : (
                s.index + 1
              )}
            </span>
            <span className="flex flex-col items-start min-w-0">
              <span
                className={cn(
                  "text-[12.5px] font-semibold whitespace-nowrap",
                  state === "active"
                    ? "text-text"
                    : state === "done"
                      ? "text-text2"
                      : "text-muted",
                )}
              >
                {s.label}
              </span>
              {s.subLabel && (
                <span className="text-[10.5px] text-muted whitespace-nowrap">{s.subLabel}</span>
              )}
            </span>
          </button>
          {!isLast && (
            <span className="flex-1 mx-3 h-px bg-line relative overflow-hidden" aria-hidden>
              <span
                className={cn(
                  "absolute inset-y-0 left-0 bg-ink transition-[width] duration-[280ms] ease-spring",
                  s.index < current ? "w-full" : "w-0",
                )}
              />
            </span>
          )}
        </li>
      );
    })}
  </ol>
);

export default Stepper;
