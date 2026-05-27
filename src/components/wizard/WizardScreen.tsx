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
// StepPlaceholder 는 Step 5 placeholder 였는데 Step5Export 구현 후 unused.
// 향후 다른 placeholder 가 필요해질 때 다시 살리기 쉽도록 정의는 유지하지 않고 제거.
import { ModalShell } from "@app/components/modal/ModalShell";
import { deletePageImages, deleteThumbnails } from "@app/lib/imageStore";
import { deleteIfDraft } from "@app/services/api/tests";
import { removeTestFolder } from "@app/services/api/storage";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import { useWizardGuard } from "@app/hooks/useWizardGuard";
import { Stepper, type StepperStep } from "./Stepper";
import { StepFrame } from "./StepFrame";
import { WizardFooter } from "./WizardFooter";
import { Step1Upload } from "./Step1Upload";
import { Step1_5CropInspect } from "./Step1_5CropInspect";
import { Step2OCRReview } from "./Step2OCRReview";
import { Step3SolutionReview } from "./Step3SolutionReview";
import { Step3Options } from "./Step3Options";
import { Step4Review } from "./Step4Review";
import { Step5Export } from "./Step5Export";

const STEPS: StepperStep[] = [
  { index: 0, label: "업로드", subLabel: "PDF → 이미지" },
  { index: 1, label: "검수", subLabel: "박스 확인" },
  { index: 2, label: "OCR", subLabel: "문제 추출" },
  { index: 3, label: "해설", subLabel: "정답 · 풀이" },
  { index: 4, label: "옵션", subLabel: "변환 설정" },
  { index: 5, label: "검토", subLabel: "문항별 확정" },
  { index: 6, label: "내보내기", subLabel: "PDF · DOCX" },
];

/**
 * 7-step wizard orchestrator (Phase I-6 — Step 1.5 검수 추가):
 * 0 업로드 / 1 검수 (크롭 박스) / 2 OCR / 3 해설 / 4 옵션 / 5 검토 /
 * 6 내보내기. State lives in `wizardStore` (sessionStorage-persisted v3,
 * v2 → v3 migrate 가 step >= 1 을 +1 shift). On mount we guard against
 * accidental tab-close so partial conversion results aren't lost.
 */
export const WizardScreen = () => {
  const step = useWizardStore((s) => s.step);
  const setStep = useWizardStore((s) => s.setStep);
  const next = useWizardStore((s) => s.next);
  const prev = useWizardStore((s) => s.prev);
  const reset = useWizardStore((s) => s.reset);
  const markAllCropInspected = useWizardStore((s) => s.markAllCropInspected);
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
    // "이어서 작업" 으로 보관함에서 직접 hydrate 한 경우 — 사용자가 명시적으로
    // 불러온 시험지라 resume 다이얼로그를 띄우지 않는다 (1회용 플래그).
    if (s.justHydrated) {
      useWizardStore.setState({ justHydrated: false });
      return;
    }
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

  // ── Phase B: Supabase draft 상태 row + Storage 파일 cleanup. status="ok"/"warn"
  // 으로 이미 진행한 시험지는 library 에 *보존* — deleteIfDraft 안에서 status 확인.
  const cleanupSupabaseDraft = async () => {
    const id = useWizardStore.getState().testId;
    if (!id) return;
    try {
      const deleted = await deleteIfDraft(id);
      if (deleted) await removeTestFolder(id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[WizardScreen] Supabase draft cleanup failed:", err);
    }
  };

  const handleRestart = async () => {
    await Promise.all([cleanupIndexedDB(), cleanupSupabaseDraft()]);
    reset();
    setResumeDialog(null);
  };

  const handleExit = async () => {
    await Promise.all([cleanupIndexedDB(), cleanupSupabaseDraft()]);
    reset();
    backToLibrary();
  };

  useWizardGuard(step > 0 && step < 6 && !resumeDialog);

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
        handleNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const canAdvance = step === 0 ? pages.length > 0 : true;

  /**
   * Step 1 (검수) → Step 2 (OCR) transition 시 미검토 페이지 *자동 일괄 완료*.
   * 사용자 결정 (§23-7 #2): 검수는 선택, 건너뛰기 가능. 그러나 cropInspected=false
   * 인 채로 next() 하면 Phase I-7b 의 cropped Pass 2 가 조건 불충족으로 트리거
   * 안 됨 → Pass 1 (whole-page) 결과만 보여 정확도 손해. handleNext 가 "다음"
   * 클릭/단축키 양쪽 진입점에서 silent markAllCropInspected → Pass 2 활성화.
   * 사용자가 *명시적으로* 박스를 편집하지 않은 경우 = AI 결과 신뢰 의미로 해석.
   */
  const handleNext = () => {
    if (step === 1) markAllCropInspected();
    next();
  };

  return (
    <div className="w-full h-full flex flex-col bg-bg min-w-[1024px]">
      {/* `wizard-chrome` 클래스는 `@media print` 에서 일괄 숨김 — Step 5
          인쇄/PDF 시 topbar / stepper / footer 가 출력물에 누수되지 않도록. */}
      <div className="wizard-chrome">
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
      </div>

      {/* Stepper */}
      <div className="px-8 py-4 border-b border-line bg-surface wizard-chrome">
        {/* max-w 2200 — QHD (2560) 까지 활용, 좌우 여백 ~180px (사용자 결정 2026-05-26) */}
        <div className="max-w-[2200px] mx-auto">
          <Stepper steps={STEPS} current={step} onJump={setStep} />
        </div>
      </div>

      {/* Step content. Step 5 일 때 main 자체는 미리보기 갤러리지만 인쇄
          시에는 hidden printable-root 만 보여야 하므로 wizard-chrome-preview. */}
      <main
        className={`flex-1 overflow-auto${step === 6 ? " wizard-chrome-preview" : ""}`}
      >
        <StepFrame step={step}>
          {step === 0 && <Step1Upload onComplete={() => setStep(1)} />}
          {step === 1 && <Step1_5CropInspect />}
          {step === 2 && <Step2OCRReview />}
          {step === 3 && <Step3SolutionReview />}
          {step === 4 && <Step3Options />}
          {step === 5 && <Step4Review />}
          {step === 6 && <Step5Export />}
        </StepFrame>
      </main>

      {/* Step 6 (내보내기) 는 PrintActionPanel 이 footer 역할 흡수 — 통째 숨김. */}
      {step !== 6 && (
        <div className="wizard-chrome">
          <WizardFooter
            step={step}
            totalSteps={STEPS.length}
            onPrev={prev}
            onNext={handleNext}
            canAdvance={canAdvance}
          />
        </div>
      )}

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
