import { Btn, Kbd } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";
import type { WizardStepIndex } from "@app/stores/wizardStore";

export interface WizardFooterProps {
  step: WizardStepIndex;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  /** Disable "다음" while the current step has unmet requirements. */
  canAdvance?: boolean;
  /** Custom label for the next button (e.g. "내보내기" on Step 5). */
  nextLabel?: string;
  /** Render extra action(s) on the left side of the footer. */
  leftSlot?: React.ReactNode;
}

/**
 * Sticky bottom bar — 이전/다음 buttons, step-progress dots, ⌘← / ⌘→ hint.
 * Mirrors hifi/wizard.jsx but adapted for our design tokens.
 */
export const WizardFooter = ({
  step,
  totalSteps,
  onPrev,
  onNext,
  canAdvance = true,
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
            <Kbd>⌘</Kbd>
            <Kbd>←</Kbd>
            <span>이전</span>
            <span className="mx-1 text-line-strong">·</span>
            <Kbd>⌘</Kbd>
            <Kbd>→</Kbd>
            <span>다음</span>
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
        <Btn kind="ghost" onClick={onPrev} disabled={isFirst} icon="arrow-left">
          이전
        </Btn>
        <Btn
          kind="accent"
          onClick={onNext}
          disabled={!canAdvance || isLast}
          iconRight={isLast ? undefined : "arrow-right"}
          icon={isLast ? "download-simple" : undefined}
        >
          {nextLabel ?? (isLast ? "내보내기" : "다음")}
        </Btn>
      </div>
    </div>
  );
};

export default WizardFooter;
