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
  /**
   * Phase #16: 한 번 도달한 가장 멀리 간 step. 사용자가 prev 로 돌아가도
   * `furthest` 이하 step 은 done 유지. 사용자 보고: "완료된 항목에 대해
   * 이전 누르면 완료가 풀려버림" (2026-05-27). store 의 furthestStep 으로 전달.
   */
  furthest?: WizardStepIndex;
  onJump?: (index: WizardStepIndex) => void;
}

/**
 * 7-step horizontal stepper. States per step:
 *   - done   → ink fill + check icon (current 미만 또는 furthest 이하)
 *   - active → accent border + accent number
 *   - future → muted number + dashed border
 *
 * The connector line between steps animates from 0 → 100% as you progress
 * (280ms ease). Clicking a `done` step jumps back to it.
 */
export const Stepper = ({ steps, current, furthest, onJump }: StepperProps) => (
  <ol className="flex items-center w-full" role="list">
    {steps.map((s, i) => {
      // Phase #16: furthest 가 있으면 그 이하 step (current 제외) 도 done 으로.
      // furthest 미설정 (옛 호출처) 면 기존 동작 — current 미만만 done.
      const reachedMax = (furthest ?? current) as number;
      const isDone =
        s.index !== current &&
        (s.index < current || s.index < reachedMax);
      const state: "done" | "active" | "future" = isDone
        ? "done"
        : s.index === current
          ? "active"
          : "future";
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
                  // Phase #16: connector line — step N 이 done 이면 fill 유지.
                  // (furthest 가 있으면 그 이하 connector 도 done.)
                  s.index < current || s.index < (furthest ?? current) ? "w-full" : "w-0",
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
