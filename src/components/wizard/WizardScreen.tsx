import { useEffect, useRef, useState } from "react";
import {
  Btn,
  Card,
  Chip,
  Divider,
  Heading,
  Icon,
  TopBar,
} from "@app/components/ui";
import { ModalShell } from "@app/components/modal/ModalShell";
import { deletePageImages, deleteThumbnails } from "@app/lib/imageStore";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import { useWizardGuard } from "@app/hooks/useWizardGuard";
import { Stepper, type StepperStep } from "./Stepper";
import { StepFrame } from "./StepFrame";
import { WizardFooter } from "./WizardFooter";
import { Step1Upload } from "./Step1Upload";
import { Step2OCRReview } from "./Step2OCRReview";
import { Step3SolutionReview } from "./Step3SolutionReview";
import { Step3Options } from "./Step3Options";
import { Step4Review } from "./Step4Review";

const STEPS: StepperStep[] = [
  { index: 0, label: "업로드", subLabel: "PDF → 이미지" },
  { index: 1, label: "OCR", subLabel: "문제 추출" },
  { index: 2, label: "해설", subLabel: "정답 · 풀이" },
  { index: 3, label: "옵션", subLabel: "변환 설정" },
  { index: 4, label: "검토", subLabel: "문항별 확정" },
  { index: 5, label: "내보내기", subLabel: "PDF · DOCX" },
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
  const uploadedFileName = useWizardStore((s) => s.uploadedFileName);

  const backToLibrary = useAppStore((s) => s.backToLibrary);
  const getTest = useLibraryStore((s) => s.getTest);
  const sourceTest = testId ? getTest(testId) : undefined;

  // 새로 wizard 진입할 때 sessionStorage 에 미완료 작업이 남아있으면 사용자에게
  // 명시적으로 묻는다. Plan 4.0 의 "이전 작업 이어하기 / 새로 시작" 다이얼로그.
  // 이 안 묻고 자동 복원하면, stale state (옛 schema, 깨진 IndexedDB ref,
  // 잘못 저장된 ocrComplete=true) 가 새 mount 에 그대로 들어가 OCR pipeline
  // hang / 빈 결과 같은 silent 버그를 유발했음 (사용자 보고).
  const [resumeDialog, setResumeDialog] = useState<{
    fileName: string;
    step: number;
    pagesDone: number;
    pagesTotal: number;
  } | null>(null);
  const promptedRef = useRef(false);
  useEffect(() => {
    if (promptedRef.current) return;
    promptedRef.current = true;
    // 마운트 시점에 sessionStorage 가 hydrate 된 상태. uploadedFileName 또는
    // 페이지 데이터가 살아 있으면 "이어하기 / 새로 시작" 묻는다.
    const s = useWizardStore.getState();
    const hasState = Boolean(s.uploadedFileName) || s.pages.length > 0;
    if (hasState) {
      setResumeDialog({
        fileName: s.uploadedFileName ?? "(파일명 없음)",
        step: s.step,
        pagesDone: s.pages.filter((p) => p.ocrComplete).length,
        pagesTotal: s.pages.length,
      });
    }
  }, []);

  const cleanupIndexedDB = async () => {
    const refs = useWizardStore.getState().pages;
    const imageRefs = refs.map((p) => p.imageRef).filter(Boolean);
    const thumbRefs = refs.map((p) => p.thumbRef).filter(Boolean);
    try {
      await Promise.all([deletePageImages(imageRefs), deleteThumbnails(thumbRefs)]);
    } catch (err) {
      // best-effort cleanup — 실패해도 다음 wizard 진행에 영향 없음.
      // eslint-disable-next-line no-console
      console.warn("[WizardScreen] IndexedDB cleanup partial failure", err);
    }
  };

  const handleRestart = async () => {
    await cleanupIndexedDB();
    reset();
    setResumeDialog(null);
  };

  const handleExit = async () => {
    await cleanupIndexedDB();
    reset();
    backToLibrary();
  };

  useWizardGuard(step > 0 && step < 5 && !resumeDialog);

  // Mod+← / Mod+→ navigation (Mac ⌘, Windows/Linux Ctrl — `metaKey || ctrlKey`).
  // Ignore arrow keys when an input is focused.
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
              onClick={handleExit}
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
          {step === 1 && <Step2OCRReview />}
          {step === 2 && <Step3SolutionReview />}
          {step === 3 && <Step3Options />}
          {step === 4 && <Step4Review />}
          {step === 5 && (
            <StepPlaceholder
              title="Step 6 — 내보내기"
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

      {resumeDialog && (
        <ModalShell
          open
          onClose={() => setResumeDialog(null)}
          aria-label="이전 변환 작업 발견"
          className="max-w-[460px] w-full"
        >
          <Card pad={24} className="border-0 shadow-none">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="grid place-items-center flex-shrink-0 text-accent"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "rgba(14,165,233,0.12)",
                }}
              >
                <Icon name="hourglass-medium" size={18} weight="duotone" />
              </div>
              <div className="min-w-0">
                <Heading level="h2">진행 중인 변환이 있어요</Heading>
                <p className="mt-1 text-small text-muted">
                  새로고침 / 탭 재진입으로 이전 작업이 복원되었습니다. 이어할지,
                  처음부터 새로 시작할지 선택하세요.
                </p>
              </div>
            </div>

            <div className="rounded-r2 bg-surface2 px-4 py-3 text-small space-y-1.5">
              <div className="flex justify-between gap-3">
                <span className="text-muted">시험지</span>
                <span className="text-text truncate">{resumeDialog.fileName}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted">마지막 단계</span>
                <span className="text-text">
                  {STEPS[resumeDialog.step]?.label ?? `Step ${resumeDialog.step + 1}`}
                </span>
              </div>
              {resumeDialog.pagesTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted">OCR 진행</span>
                  <span className="text-text">
                    {resumeDialog.pagesDone} / {resumeDialog.pagesTotal} 페이지
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <Btn kind="ghost" onClick={handleRestart} icon="trash">
                새로 시작
              </Btn>
              <Btn kind="accent" onClick={() => setResumeDialog(null)} icon="play">
                이어하기
              </Btn>
            </div>
          </Card>
        </ModalShell>
      )}
    </div>
  );
};

export default WizardScreen;
