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
import { showToast } from "@app/stores/toastStore";
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
  { index: 1, label: "검수", subLabel: "문제 잘라내기" },
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
  // Phase #16: 한 번 도달한 가장 멀리 간 step — Stepper 의 done 유지 (prev 후에도).
  const furthestStep = useWizardStore((s) => s.furthestStep);
  const setStep = useWizardStore((s) => s.setStep);
  const next = useWizardStore((s) => s.next);
  const prev = useWizardStore((s) => s.prev);
  const reset = useWizardStore((s) => s.reset);
  const pages = useWizardStore((s) => s.pages);
  const ocrConfirmed = useWizardStore((s) => s.ocrConfirmed);
  const setOcrConfirmed = useWizardStore((s) => s.setOcrConfirmed);
  const solutionConfirmed = useWizardStore((s) => s.solutionConfirmed);
  const setSolutionConfirmed = useWizardStore((s) => s.setSolutionConfirmed);
  const markAllCropInspected = useWizardStore((s) => s.markAllCropInspected);
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

  // handleNext 는 canAdvance(step 별 변동) 를 읽으므로, keydown 핸들러가 stale
  // closure 를 잡지 않도록 latest-ref 로 참조 (아래 handleNext 정의 후 매 렌더 갱신).
  const handleNextRef = useRef<() => void>(() => {});

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
        handleNextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev]);

  // 단계 게이팅 (사용자 결정 2026-06-02): 이전 단계가 완료돼야 다음으로 진행.
  // 단 해설(step 3)은 스킵 가능. 비-문항·비-force 페이지는 검수/OCR 면제.
  //
  // **확인 버튼 위치 일관성** (사용자 보고 2026-06-02): 단계마다 확인 버튼 위치가
  // 바뀌면 헷갈림. footer 는 모든 단계에 공통이라, 게이팅이 있는 단계(검수·OCR)는
  // *footer 주 버튼*을 "모든 ~ 완료" 로 바꿔 누르면 확인+진행을 한 번에. 검수의
  // 사이드바 확인 버튼은 제거 (footer 로 일원화).
  //   - step 0 업로드: 페이지 1장 이상
  //   - step 1 검수: 모든 (문항) 페이지 cropInspected — footer "모든 페이지 검토 완료"
  //   - step 2 OCR: ocrConfirmed — footer "모든 문항 확인 완료"
  //   - step 3 해설~: 게이트 없음 (해설 스킵 가능)
  const problemPageList = pages.filter((p) => p.isProblemPage || p.forceOcr);
  const allProblemOcrDone = problemPageList.every((p) => p.ocrComplete);
  const allCropInspected = problemPageList.every((p) => p.cropInspected);
  // 검출이 끝난(=결과가 있고 진행 중 아님) 상태여야 검토 완료 가능.
  const allCropDetected = problemPageList.every(
    (p) => p.cropBoxes !== undefined && !p.cropDetectInflight,
  );
  // 해설(step 3): 적격 문항(text 있고 bodyMissing 아님)의 해설이 *모두 끝났는지*
  // (solution 또는 solutionError). 생성 중이면 false → 스킵 허용. 모두 끝나면
  // "모든 문항 해설 확인 완료" 확인 요구 (OCR 미러, 단 스킵 가능 정책 유지).
  const solutionEligible = problemPageList
    .flatMap((p) => p.ocrResult)
    .filter((it) => it.text && !it.bodyMissing);
  const allSolutionsDone = solutionEligible.every(
    (it) => !!it.solution || !!it.solutionError,
  );
  const canAdvance = (() => {
    switch (step) {
      case 0:
        return pages.length > 0;
      case 1:
        return allCropInspected;
      case 2:
        // 확인 후 페이지 재OCR 로 미완료가 생기면 재차단 (allProblemOcrDone).
        return ocrConfirmed && allProblemOcrDone;
      case 3:
        // 해설은 스킵 가능: 생성 중(미완료)이면 통과, 모두 끝나면 확인 요구.
        return !allSolutionsDone || solutionConfirmed;
      default:
        return true;
    }
  })();

  // 검수/OCR 단계: 그 단계의 작업(검출/OCR)이 끝나면 footer 주 버튼을 "모든 ~
  // 완료" 로 바꿔, 누르면 확인+진행 한 번에. **이미 확인된 상태로 재방문해도 같은
  // 버튼이 보이도록** !allCropInspected/!ocrConfirmed 조건은 두지 않음 — 사용자
  // 보고 2026-06-02: 한 번 검토한 시험지(cropInspected 영속) 를 다시 열면 버튼이
  // "다음" 으로 바뀌어 사이드바 안내("'모든 페이지 검토 완료' 버튼")와 불일치.
  const needsCropConfirm = step === 1 && allCropDetected;
  const needsOcrConfirm = step === 2 && allProblemOcrDone;
  const needsSolutionConfirm = step === 3 && allSolutionsDone && !solutionConfirmed;
  const nextLabel = needsCropConfirm
    ? "모든 페이지 검토 완료"
    : needsOcrConfirm
      ? "모든 문항 확인 완료"
      : needsSolutionConfirm
        ? "모든 문항 해설 확인 완료"
        : undefined;

  // 차단 사유 — 다음 버튼 옆 안내 + 경고 토스트 메시지로 공용. 확인 대기 상태
  // (needsCropConfirm/needsOcrConfirm)는 버튼 라벨이 곧 안내라 별도 사유 표시 X.
  const blockedReason = canAdvance
    ? undefined
    : step === 0
      ? "PDF를 먼저 업로드해주세요"
      : step === 1 && !allCropDetected
        ? "문항 검출이 끝나면 진행할 수 있어요"
        : step === 2 && !allProblemOcrDone
          ? "모든 페이지 OCR 완료 후 진행할 수 있어요"
          : undefined;

  // 미충족 항목 체크리스트 (경고 토스트) — 어떤 페이지를 채워야 하는지 명시.
  // 사용자 요청 2026-06-02: 경고에 체크리스트를 주면 더 쓰기 쉬움.
  const blockedChecklist = (() => {
    if (canAdvance) return undefined;
    if (step === 0) return "다음으로 넘어가려면:\n☐ PDF 업로드";
    const problemPages = pages
      .map((p, i) => ({ p, n: i + 1 }))
      .filter(({ p }) => p.isProblemPage || p.forceOcr);
    if (step === 1) {
      // 검출이 모두 끝나면 needsCropConfirm 분기로 footer 버튼이 곧 검토 완료
      // 버튼 — 체크리스트 불필요. 검출 진행 중인 페이지만 안내.
      const detecting = problemPages.filter(
        ({ p }) => p.cropBoxes === undefined || p.cropDetectInflight,
      );
      if (detecting.length > 0) {
        return `문항 검출이 끝나야 진행할 수 있어요:\n${detecting
          .map(({ n }) => `☐ 페이지 ${n} — 검출 진행 중`)
          .join("\n")}`;
      }
      return undefined;
    }
    if (step === 2) {
      // OCR 이 모두 끝나면 needsOcrConfirm 분기로 footer 버튼이 곧 확인 버튼이라
      // 체크리스트가 필요 없음 — 미완료 페이지가 있을 때만 안내.
      const pending = problemPages.filter(({ p }) => !p.ocrComplete);
      if (pending.length > 0) {
        return `OCR이 끝나야 다음으로 넘어갈 수 있어요:\n${pending
          .map(({ n }) => `☐ 페이지 ${n} — 인식 진행 중`)
          .join("\n")}`;
      }
      return undefined;
    }
    return undefined;
  })();

  // 게이팅 (사용자 요청 2026-06-02): 조건 미충족 상태로 "다음" 시도 시 *체크리스트
  // 경고 토스트*. 버튼은 비활성 대신 클릭 가능하게 두고 (WizardFooter), 여기서 차단.
  // Ctrl+→ 단축키도 handleNext 경유라 동일 적용. 검수는 "검토 완료" 명시 필요.
  const handleNext = () => {
    // 검수: 검출 완료 + 미검토 상태에서 footer 주 버튼("모든 페이지 검토 완료")을
    // 누르면 모든 페이지 검토 완료 처리 후 바로 다음 단계로.
    if (needsCropConfirm) {
      markAllCropInspected();
      next();
      return;
    }
    // step 2: OCR 모두 완료 + 미확인 상태에서 footer 주 버튼("모든 문항 확인 완료")
    // 을 누르면 — 이 클릭이 곧 명시적 확인. 확인 처리 후 바로 다음 단계로.
    if (needsOcrConfirm) {
      setOcrConfirmed(true);
      next();
      return;
    }
    // 해설: 모든 해설 완료 + 미확인 상태에서 "모든 문항 해설 확인 완료" 클릭.
    if (needsSolutionConfirm) {
      setSolutionConfirmed(true);
      next();
      return;
    }
    if (!canAdvance) {
      showToast({
        kind: "warn",
        message:
          blockedChecklist ?? blockedReason ?? "이전 단계를 완료해야 넘어갈 수 있어요.",
        durationMs: 6000,
      });
      return;
    }
    next();
  };
  // keydown 핸들러가 최신 handleNext 를 호출하도록 매 렌더 ref 갱신.
  handleNextRef.current = handleNext;

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
          <Stepper
            steps={STEPS}
            current={step}
            furthest={furthestStep}
            completed={step === STEPS.length - 1}
            onJump={setStep}
          />
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
            blockedReason={blockedReason}
            nextLabel={nextLabel}
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
