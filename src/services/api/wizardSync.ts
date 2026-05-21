import { useWizardStore } from "@app/stores/wizardStore";
import type { WizardPage, OCRProblem, ProblemReview } from "@app/stores/wizardStore";
import { updatePageOcr } from "./pages";
import { upsertOcrProblems, updateOcrProblem } from "./problems";
import { upsertReviews, updateReview } from "./reviews";
import { insertVariantBatch } from "./variantHistory";
import type { PageInsert, OcrProblemInsert, ReviewInsert } from "./mappers";

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

export const installWizardSync = (): void => {
  if (installed) return;
  installed = true;
  unsubscribe = useWizardStore.subscribe((state, prev) => {
    const testId = state.testId;
    if (!testId) return;
    // ── pages 변경 감지 ────────────────────────────────────────────────────
    if (state.pages !== prev.pages) {
      for (const newPage of state.pages) {
        const oldPage = prev.pages.find((p) => p.id === newPage.id);
        if (!oldPage) continue; // 신규 페이지는 Step1Upload 가 직접 insert
        syncPageDiff(newPage, oldPage);
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
        const label = `${state.goal} / ${state.difficulty}`;
        void insertVariantBatch(testId, intensity, state.problems.length, label);
      } else {
        for (const newReview of state.problems) {
          const oldReview = prev.problems.find((r) => r.id === newReview.id);
          if (!oldReview) continue;
          syncReviewDiff(newReview, oldReview);
        }
      }
    }
  });
};

export const uninstallWizardSync = (): void => {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  installed = false;
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
