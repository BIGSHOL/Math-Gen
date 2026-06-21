import { useWizardStore } from "@app/stores/wizardStore";
import type { WizardPage, OCRProblem, ProblemReview } from "@app/stores/wizardStore";
import { updatePageOcr } from "./pages";
import { upsertOcrProblems, updateOcrProblem } from "./problems";
import { upsertReviews, updateReview } from "./reviews";
import { insertVariantBatch } from "./variantHistory";
import { updateTest } from "./tests";
import type { PageInsert, OcrProblemInsert, ReviewInsert } from "./mappers";
import { buildVariantLabel } from "@app/lib/conversionLabels";

/**
 * wizardStore → Supabase background sync.
 *
 * 패턴: zustand subscribe 콜백 안에서 prevState/nextState diff 계산 → 적절한
 * service 함수 `void` dispatch. setter 안에서 sync 호출 X → partialize loop 회피.
 *
 * Step 1 (pages 신규 생성) 은 Step1Upload 가 *직접* `pages.insertPage` 호출 —
 * Storage upload 의 dataUrl 이 store 에 없어서. wizardSync 는 *기존 row 의
 * 변경* 만 처리 (Step 2/3/4 의 setter 들).
 *
 * 휘발성 필드 (in-flight 마커, startedAt timestamp 등) 는 diff 비교에서 *제외* —
 * DB sync 트리거 X.
 */

let installed = false;
let unsubscribe: (() => void) | null = null;
/**
 * `suspendWizardSync` 가 켜는 플래그. true 인 동안 subscribe 콜백이 no-op.
 * `hydrateFromTest` 의 set() 이 콜백을 깨워 problems 첫-seed 로 오인 →
 * `insertVariantBatch` 가 variant_history 를 오염시키는 것을 막는다.
 */
let suspended = false;

/**
 * fn 실행 동안 wizardStore → Supabase sync 를 일시 정지. zustand 의 set() 과
 * subscribe 콜백은 *동기* 실행이므로, fn 안의 모든 set() 이 try 범위에서 끝나
 * finally 가 정확히 그 만큼만 건너뛴다. "이어서 작업" hydrate 가 사용.
 */
export const suspendWizardSync = (fn: () => void): void => {
  suspended = true;
  try {
    fn();
  } finally {
    suspended = false;
  }
};

export const installWizardSync = (): void => {
  if (installed) return;
  installed = true;
  unsubscribe = useWizardStore.subscribe((state, prev) => {
    if (suspended) return; // hydrateFromTest 등 — 의도적으로 sync 건너뜀
    const testId = state.testId;
    if (!testId) return;
    // ── pages 변경 감지 ────────────────────────────────────────────────────
    if (state.pages !== prev.pages) {
      for (const newPage of state.pages) {
        const oldPage = prev.pages.find((p) => p.id === newPage.id);
        if (!oldPage) continue; // 신규 페이지는 Step1Upload 가 직접 insert
        syncPageDiff(newPage, oldPage);
      }
      // 모든 페이지 OCR 완료 시 tests 행 상태 1회 갱신 — 업로드 때 박힌
      // "OCR 대기" 가 영원히 안 바뀌던 버그 (사용자 보고) 해소.
      if (state.pages.length > 0) {
        const allDoneNow = state.pages.every(pageOcrDone);
        const allDonePrev =
          prev.pages.length > 0 && prev.pages.every(pageOcrDone);
        if (allDoneNow && !allDonePrev) {
          syncTestStatusAfterOcr(testId, state.pages);
        }
      }
    }
    // ── problems (variant reviews) 변경 감지 ──────────────────────────────
    if (state.problems !== prev.problems) {
      if (prev.problems.length === 0 && state.problems.length > 0) {
        // 첫 seed — useVariantGen 의 mount effect 가 호출. batch upsert.
        const pairs = state.problems.map((review) => ({
          ocrProblemId: review.id, // useVariantGen 가 OCRProblem.id 재사용
          review,
        }));
        void upsertReviews(testId, pairs);
        const intensity: 0 | 1 | 2 =
          state.goal === "digitize" ? 0 : state.goal === "similar" ? 1 : 2;
        const label = buildVariantLabel(state.goal, state.difficulty);
        void insertVariantBatch(testId, intensity, state.problems.length, label);
      } else {
        for (const newReview of state.problems) {
          const oldReview = prev.problems.find((r) => r.id === newReview.id);
          if (!oldReview) continue;
          syncReviewDiff(newReview, oldReview);
        }
      }
    }
    // ── 진행 단계(furthestStep) 변경 → tests.furthest_step 갱신 ────────────────
    // 목록 카드 진행단계 표시 + "이어서 작업" resume 단계 (사용자 결정 2026-06-02).
    // 컬럼 미마이그레이션 DB 는 tests.ts 의 graceful fallback 이 strip.
    if (state.furthestStep !== prev.furthestStep) {
      void updateTest(testId, { furthest_step: state.furthestStep }, { debounceMs: 800 });
    }
  });
};

export const uninstallWizardSync = (): void => {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  installed = false;
};

// ============================================================================
// tests 행 상태 갱신
// ============================================================================

/** 페이지의 OCR 가 끝났는지 (성공 또는 에러 — 둘 다 "더는 진행 중 아님"). */
const pageOcrDone = (p: WizardPage): boolean =>
  p.ocrComplete || Boolean(p.ocrError);

/**
 * 모든 페이지 OCR 완료 시 tests 행 갱신.
 * - problem_count: 업로드 때 박은 추정치(페이지 × 5) → 실제 추출 문항 수로 교체.
 * - status / status_text: OCR 결과 confidence 기반. warn/pending 문항이 있으면
 *   "검토 필요 N건", 전부 ok 면 "확정". HeroCard 통계와 같은 기준.
 */
const syncTestStatusAfterOcr = (testId: string, pages: WizardPage[]): void => {
  const problems = pages.flatMap((p) => p.ocrResult);
  const warnCount = problems.filter(
    (it) => it.status === "warn" || it.status === "pending",
  ).length;
  void updateTest(
    testId,
    {
      problem_count: problems.length,
      status: warnCount > 0 ? "warn" : "ok",
      status_text: warnCount > 0 ? `검토 필요 ${warnCount}건` : "확정",
    },
    { debounceMs: 800 },
  );
};

// ============================================================================
// 페이지 diff
// ============================================================================

const syncPageDiff = (next: WizardPage, prev: WizardPage): void => {
  // 휘발 필드는 skip — DB sync 트리거 X
  const pagePatch: Partial<PageInsert> = {};
  if (prev.ocrComplete !== next.ocrComplete) pagePatch.ocr_complete = next.ocrComplete;
  if (prev.ocrError !== next.ocrError) pagePatch.ocr_error = next.ocrError ?? null;
  if (prev.ocrModel !== next.ocrModel) pagePatch.ocr_model = next.ocrModel ?? null;
  if (prev.rotation !== next.rotation) pagePatch.rotation = next.rotation;
  if (prev.forceOcr !== next.forceOcr) pagePatch.force_ocr = next.forceOcr ?? false;
  // Phase I: cropBoxes / cropInspected 영구 저장 — 보관함 재열기 시 재검출 차단.
  // cropBoxes 배열 reference 비교 (mutation 안 함 — store 가 새 배열 emit).
  if (prev.cropBoxes !== next.cropBoxes) pagePatch.crop_boxes = next.cropBoxes ?? null;
  if (prev.cropInspected !== next.cropInspected)
    pagePatch.crop_inspected = next.cropInspected ?? false;
  if (Object.keys(pagePatch).length > 0) {
    void updatePageOcr(next.id, pagePatch);
  }
  // ocrResult 변경 — 처음 채워질 때는 batch upsert, 부분 patch 는 item 별
  if (prev.ocrResult !== next.ocrResult) {
    const prevLen = prev.ocrResult.length;
    const nextLen = next.ocrResult.length;
    if (prevLen === 0 && nextLen > 0) {
      // 첫 OCR 결과 — page 의 모든 문항 batch upsert
      void upsertOcrProblems(next.id, next.ocrResult);
    } else if (nextLen > 0) {
      // 부분 patch — item 별 diff
      for (const newItem of next.ocrResult) {
        const oldItem = prev.ocrResult.find((i) => i.id === newItem.id);
        if (!oldItem) continue;
        syncItemDiff(newItem, oldItem);
      }
    }
  }
};

// ============================================================================
// OCR item diff
// ============================================================================

const syncItemDiff = (next: OCRProblem, prev: OCRProblem): void => {
  const patch: Partial<OcrProblemInsert> = {};
  if (prev.text !== next.text) patch.text = next.text;
  if (prev.solution !== next.solution) patch.solution = next.solution ?? null;
  if (prev.answer !== next.answer) patch.answer = next.answer ?? null;
  if (prev.solutionModel !== next.solutionModel)
    patch.solution_model = next.solutionModel ?? null;
  if (prev.ocrModel !== next.ocrModel) patch.ocr_model = next.ocrModel ?? null;
  if (prev.topic !== next.topic) patch.topic = next.topic ?? null;
  if (prev.reviewed !== next.reviewed) patch.reviewed = next.reviewed;
  if (prev.status !== next.status) patch.status = next.status;
  if (prev.bodyMissing !== next.bodyMissing) patch.body_missing = next.bodyMissing ?? false;
  if (prev.choicesMissing !== next.choicesMissing)
    patch.choices_missing = next.choicesMissing ?? false;
  if (prev.solutionWarnings !== next.solutionWarnings)
    patch.solution_warnings = next.solutionWarnings ?? null;
  // Phase F (dedup): diagram_params 변경 시 sync — Pass 2 가 새 도형 emit 시.
  if (prev.diagramParams !== next.diagramParams)
    patch.diagram_params = next.diagramParams ?? null;
  // Phase B: figures(레이아웃 box) 변경 sync — 위치 기반 배치 영구 저장.
  if (prev.figures !== next.figures) patch.figures = next.figures ?? null;
  // Phase #12/#13: images 변경 sync — 사용자 크롭 / AI 생성 결과 영구 저장.
  // 이전 누락 버그: 사용자가 박스 편집해도 새로고침 후 사라짐.
  if (prev.images !== next.images) patch.images = next.images ?? null;
  // Phase G (dedup): 자동 재시도 가드 — 한 번 fail 후 무한 retry 차단.
  if (prev.solutionAutoRetried !== next.solutionAutoRetried)
    patch.solution_auto_retried = next.solutionAutoRetried ?? false;
  // Phase #7: 보기 배치 변경 — 사용자 편집 후 또는 OCR 결과 update.
  if (prev.choicesLayout !== next.choicesLayout)
    patch.choices_layout = next.choicesLayout ?? "auto";
  // 옵션 B: 네이티브 블록 변경 sync — 재OCR/per-crop 결과 영구 저장 (HWP 일치 유지).
  if (prev.blocks !== next.blocks) patch.blocks = next.blocks ?? null;
  if (prev.choiceGroups !== next.choiceGroups)
    patch.choice_groups = next.choiceGroups ?? null;
  if (prev.score !== next.score) patch.score = next.score ?? null;
  if (prev.labelType !== next.labelType) patch.label_type = next.labelType ?? null;
  if (Object.keys(patch).length > 0) {
    void updateOcrProblem(next.id, patch, { debounceMs: 500 });
  }
};

// ============================================================================
// review diff
// ============================================================================

const syncReviewDiff = (next: ProblemReview, prev: ProblemReview): void => {
  const patch: Partial<ReviewInsert> = {};
  if (prev.status !== next.status) patch.status = next.status;
  if (prev.original !== next.original) patch.original_problem = next.original;
  if (prev.variant !== next.variant) patch.variant_problem = next.variant;
  if (prev.genModel !== next.genModel) patch.gen_model = next.genModel ?? null;
  // genError 는 *지속성 있는* 필드 — 새로고침 후에도 재시도 버튼 보여야 함
  if (prev.genError !== next.genError) patch.gen_error = next.genError ?? null;
  if (Object.keys(patch).length > 0) {
    void updateReview(next.id, patch, { debounceMs: 500 });
  }
};
