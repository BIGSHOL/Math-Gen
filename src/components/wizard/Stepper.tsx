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
  /**
   * 마지막 단계(내보내기)에서 "저장" 으로 마무리하면 그 단계도 체크 표시.
   * 사용자 보고 2026-06-02: "저장 누르면 7단계도 체크표시". true 면 current 가
   * 마지막 step 이어도 done 으로 렌더.
   */
  completed?: boolean;
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
export const Stepper = ({ steps, current, furthest, completed, onJump }: StepperProps) => (
  <ol className="flex items-center w-full" role="list">
    {steps.map((s, i) => {
      const isLastStep = i === steps.length - 1;
      // reachedMax = 도달한 가장 먼 step. `furthest ?? current` 는 furthest=0 일 때
      // 0 을 그대로 써 버그 → Math.max(furthest, current) 로 보정.
      const reachedMax = Math.max((furthest ?? 0) as number, current as number);
      // 도달한(≤reachedMax) step 은 current 제외 모두 done → 클릭 이동 가능.
      // 이전엔 `< reachedMax` 라 *가장 먼 step 자체*(예: 내보내기)는 안 눌렸다
      // (사용자 보고 2026-06-04: 저장했는데도 앞 단계 클릭 이동 불가, 하단 "다음"만 동작).
      const isDone =
        (s.index !== current && s.index <= reachedMax) ||
        (completed === true && isLastStep);
      const state: "done" | "active" | "future" = isDone
        ? "done"
        : s.index === current
          ? "active"
          : "future";
      const isLast = isLastStep;
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
                  // connector line — step N 이 reachedMax 미만이면 fill 유지.
                  s.index < reachedMax ? "w-full" : "w-0",
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
