import { Btn, Kbd, ModKey } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";
import type { WizardStepIndex } from "@app/stores/wizardStore";

export interface WizardFooterProps {
  step: WizardStepIndex;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  /** Disable "다음" while the current step has unmet requirements. */
  canAdvance?: boolean;
  /** canAdvance=false 일 때 "다음" 옆에 표시할 차단 사유 (게이팅 안내). */
  blockedReason?: string;
  /** Custom label for the next button (e.g. "내보내기" on Step 5). */
  nextLabel?: string;
  /** Render extra action(s) on the left side of the footer. */
  leftSlot?: React.ReactNode;
}

/**
 * Sticky bottom bar — 이전/다음 buttons, step-progress dots, modkey+arrow hint.
 * Modifier 키는 OS-aware (`ModKey` 컴포넌트): Mac ⌘ / Windows·Linux Ctrl.
 * 키 핸들러도 `e.metaKey || e.ctrlKey` 로 OS-aware (WizardScreen).
 * Mirrors hifi/wizard.jsx but adapted for our design tokens.
 */
export const WizardFooter = ({
  step,
  totalSteps,
  onPrev,
  onNext,
  canAdvance = true,
  blockedReason,
  nextLabel,
  leftSlot,
}: WizardFooterProps) => {
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  return (
    <div className="h-16 border-t border-line bg-surface flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        {leftSlot ?? (
          <span className="text-small text-muted flex items-center gap-2">
            <ModKey />
            <Kbd>←</Kbd>
            <span>이전</span>
            <span className="mx-1 text-line-strong">·</span>
            <ModKey />
            <Kbd>→</Kbd>
            <span>저장</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full transition-all duration-[280ms] ease-spring",
              i === step ? "bg-ink w-[18px]" : i < step ? "bg-text2 w-2" : "bg-line-strong w-2",
            )}
            aria-hidden
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        {!canAdvance && !isLast && blockedReason && (
          <span className="text-caption text-warn flex items-center gap-1 mr-1 whitespace-nowrap">
            {blockedReason}
          </span>
        )}
        <Btn kind="ghost" onClick={onPrev} disabled={isFirst} icon="arrow-left">
          이전
        </Btn>
        <Btn
          kind="accent"
          onClick={onNext}
          // canAdvance=false 여도 *클릭 가능* — onNext(handleNext)가 경고 토스트를
          // 띄우고 진행을 막는다 (사용자 요청 2026-06-02). isLast(내보내기 직전)만 비활성.
          disabled={isLast}
          iconRight={isLast ? undefined : "arrow-right"}
          icon={isLast ? "download-simple" : undefined}
        >
          {nextLabel ?? (isLast ? "내보내기" : "저장")}
        </Btn>
      </div>
    </div>
  );
};

export default WizardFooter;
