import { useEffect } from "react";
import {
  Btn,
  Chip,
  Divider,
  Heading,
  Icon,
  TopBar,
} from "@app/components/ui";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import { useWizardGuard } from "@app/hooks/useWizardGuard";
import { Stepper, type StepperStep } from "./Stepper";
import { StepFrame } from "./StepFrame";
import { WizardFooter } from "./WizardFooter";
import { Step1Upload } from "./Step1Upload";

const STEPS: StepperStep[] = [
  { index: 0, label: "업로드", subLabel: "PDF → 이미지" },
  { index: 1, label: "OCR", subLabel: "문제 추출" },
  { index: 2, label: "옵션", subLabel: "변환 설정" },
  { index: 3, label: "검토", subLabel: "문항별 확정" },
  { index: 4, label: "내보내기", subLabel: "PDF · DOCX" },
];

const StepPlaceholder = ({ title, message }: { title: string; message: string }) => (
  <div className="max-w-[640px] mx-auto px-6 py-10 text-center">
    <Icon name="hourglass-medium" size={40} weight="duotone" color="#0EA5E9" />
    <Heading level="h2" className="mt-4 justify-center">
      <span>{title}</span>
    </Heading>
    <p className="mt-3 text-body text-muted">{message}</p>
  </div>
);

/**
 * 5-step wizard orchestrator. State lives in `wizardStore` (sessionStorage-
 * persisted). On mount we guard against accidental tab-close so partial
 * conversion results aren't lost.
 *
 * Steps 1–4 are still placeholders; only Step 1 (upload) is wired up in
 * this pass — Step 2+ land in the next wizard tranche.
 */
export const WizardScreen = () => {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const next = useWizardStore((s) => s.next);
  const prev = useWizardStore((s) => s.prev);
  const reset = useWizardStore((s) => s.reset);
  const pages = useWizardStore((s) => s.pages);
  const testId = useWizardStore((s) => s.testId);

  const backToLibrary = useAppStore((s) => s.backToLibrary);
  const getTest = useLibraryStore((s) => s.getTest);
  const sourceTest = testId ? getTest(testId) : undefined;

  useWizardGuard(step > 0 && step < 4);

  // ⌘← / ⌘→ navigation; ignore arrow keys when an input is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const canAdvance = step === 0 ? pages.length > 0 : true;

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <TopBar
        left={
          <>
            <Btn
              kind="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                reset();
                backToLibrary();
              }}
              aria-label="위자드 종료"
            >
              종료
            </Btn>
            <Divider vertical className="h-[18px]" />
            <div className="flex items-center gap-2 text-body min-w-0 whitespace-nowrap overflow-hidden">
              <span className="text-muted">변환 위자드</span>
              <Icon name="caret-right" size={11} color="#9CA3AF" />
              <span
                className="text-text font-semibold overflow-hidden text-ellipsis"
                style={{ maxWidth: 280 }}
              >
                {sourceTest?.title ?? "새 시험지"}
              </span>
              <Chip tone="accent" size="sm">
                {step + 1} / {STEPS.length}
              </Chip>
            </div>
          </>
        }
      />

      {/* Stepper */}
      <div className="px-8 py-4 border-b border-line bg-surface">
        <div className="max-w-[920px] mx-auto">
          <Stepper steps={STEPS} current={step} onJump={setStep} />
        </div>
      </div>

      {/* Step content */}
      <main className="flex-1 overflow-auto">
        <StepFrame step={step}>
          {step === 0 && <Step1Upload onComplete={() => setStep(1)} />}
          {step === 1 && (
            <StepPlaceholder
              title="Step 2 — OCR 검토"
              message={`업로드한 ${pages.length}개 페이지에서 문제를 추출합니다. 다음 메시지에서 구현 예정.`}
            />
          )}
          {step === 2 && (
            <StepPlaceholder
              title="Step 3 — 변환 옵션"
              message="목표·난이도·함께 만들 자료를 선택하고 1번 문항으로 미리보기를 봅니다."
            />
          )}
          {step === 3 && (
            <StepPlaceholder
              title="Step 4 — 문항별 검토"
              message="원본 vs 변형 좌우 비교, 인라인 편집, '다시 생성'."
            />
          )}
          {step === 4 && (
            <StepPlaceholder
              title="Step 5 — 내보내기"
              message="PDF / DOCX / Online (HWP는 준비 중)."
            />
          )}
        </StepFrame>
      </main>

      <WizardFooter
        step={step}
        totalSteps={STEPS.length}
        onPrev={prev}
        onNext={next}
        canAdvance={canAdvance}
      />
    </div>
  );
};

export default WizardScreen;
