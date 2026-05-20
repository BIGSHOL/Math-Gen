import { useEffect, useMemo, useRef } from "react";
import { pLimit, withRetry } from "@app/lib/concurrency";
import { generateSolution } from "@app/services/ai/solutions";
import { useWizardStore } from "@app/stores/wizardStore";

/**
 * Step 3 orchestrator — fan out solution generation across every OCR'd
 * problem in the current wizard session.
 *
 * Mirrors `usePageOcr` but at *problem* granularity instead of page-level.
 * Solutions are text-only (no image), so we can run more in parallel
 * (`pLimit(3)`) without choking the model.
 *
 * **Skip conditions** (in order — first match short-circuits dispatch):
 *   - Item already has a `solution` (success cache).
 *   - Item is `solutionGenerating` (in flight from a previous render tick).
 *   - Item has a `solutionError` (wait for user to hit "재시도").
 *   - Item has `bodyMissing` (body too short — no point spending tokens).
 *   - Item.text is empty.
 *   - This component instance already dispatched this item (`dispatched` set).
 *
 * Cancellation: `usePageOcr` 와 동일하게 `dispatched` Set 멤버십이 단일
 * 취소 신호. mount-lifetime AbortController 를 쓰면 React 19 StrictMode /
 * HMR / 부모 conditional render 가 unmount 를 시뮬레이트할 때마다 abort 가
 * 발동해서 워커가 silently 빠지고 dispatched 가 비워지며 재 dispatch
 * 무한 루프가 생긴다 — 사용자가 Step 2 에서 정확히 본 footgun.
 * resetDispatch(page, item) 이 명시적 사용자 취소 신호.
 */
export const useSolutionGen = () => {
  const pages = useWizardStore((s) => s.pages);
  const updateOCRItem = useWizardStore((s) => s.updateOCRItem);
  // pLimit(1) — Sonnet 4.6 의 분당 RPM/TPM 한계 (~30 RPM, ~40k TPM) 가 한
  // 시험지 (30 문항) 에 대해 빠르게 차서 429 폭발. 사용자 보고: 10+ 429
  // 연속 발생 후 ERR_ABORTED. 1 개씩 순차 처리로 rate window 보호.
  // 30 문항 × ~3 초/문항 = 1.5 분 — UX 충분히 acceptable.
  const limit = useMemo(() => pLimit(1), []);

  // Track which (pageId, itemId) pairs were dispatched on THIS mount so we
  // don't re-fire on every re-render.
  const dispatched = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const page of pages) {
      // Pages skipped by the OCR pipeline (e.g. cover / answer key) won't
      // have meaningful items either.
      if (!page.isProblemPage && !page.forceOcr) continue;
      for (const item of page.ocrResult) {
        const key = `${page.id}:${item.id}`;
        if (dispatched.current.has(key)) continue;
        if (item.solution || item.solutionGenerating || item.solutionError) continue;
        if (!item.text || item.bodyMissing) continue;
        dispatched.current.add(key);
        updateOCRItem(page.id, item.id, { solutionGenerating: true });
        void limit(async () => {
          if (!dispatched.current.has(key)) return;
          try {
            const result = await withRetry(() =>
              generateSolution({
                problem: { text: item.text, topic: item.topic },
              }),
            );
            if (!dispatched.current.has(key)) return;
            updateOCRItem(page.id, item.id, {
              solution: result.solution,
              answer: result.answer,
              solutionModel: result.modelUsed,
              solutionGenerating: false,
              solutionError: undefined,
            });
          } catch (err) {
            if (!dispatched.current.has(key)) return;
            // eslint-disable-next-line no-console
            console.error(
              `[useSolutionGen] 페이지 ${page.id} 문항 ${item.number} 해설 실패`,
              err,
            );
            updateOCRItem(page.id, item.id, {
              solutionError: (err as Error).message || "알 수 없는 오류",
              solutionGenerating: false,
            });
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  /**
   * Clear the dispatched marker for a given item so the next effect cycle
   * picks it up again. Pair with `updateOCRItem(..., { solution: undefined,
   * solutionError: undefined })` to force a fresh generation.
   */
  const resetDispatch = (pageId: string, itemId: string): void => {
    dispatched.current.delete(`${pageId}:${itemId}`);
  };

  return { resetDispatch };
};
