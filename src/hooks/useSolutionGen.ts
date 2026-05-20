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
 * Three abort guards (lifted from `usePageOcr`):
 *   1. The controller lives in a ref for the *entire mount*, so re-running
 *      this effect (caused by our own `updateOCRItem` calls bumping the
 *      `pages` array) doesn't abort the in-flight requests.
 *   2. Each queued worker rechecks `signal.aborted` immediately before its
 *      `generateSolution` call.
 *   3. `generateSolution` passes the signal into the SDK, so unmount also
 *      cancels at the network layer.
 *
 * The hook returns the controller so callers (a per-card "재생성" button)
 * can clear the dispatched set entry and force a retry on demand.
 */
export const useSolutionGen = () => {
  const pages = useWizardStore((s) => s.pages);
  const updateOCRItem = useWizardStore((s) => s.updateOCRItem);
  const limit = useMemo(() => pLimit(3), []);

  // Track which (pageId, itemId) pairs were dispatched on THIS mount so we
  // don't re-fire on every re-render.
  const dispatched = useRef<Set<string>>(new Set());

  // Controller lives for the whole mount (see docstring guard #1).
  const ctrlRef = useRef<AbortController | null>(null);
  if (ctrlRef.current === null) ctrlRef.current = new AbortController();

  useEffect(() => () => ctrlRef.current?.abort(), []);

  useEffect(() => {
    const ctrl = ctrlRef.current!;
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
          if (ctrl.signal.aborted) return;
          try {
            const result = await withRetry(() =>
              generateSolution({
                problem: { text: item.text, topic: item.topic },
                signal: ctrl.signal,
              }),
            );
            if (ctrl.signal.aborted) return;
            updateOCRItem(page.id, item.id, {
              solution: result.solution,
              answer: result.answer,
              solutionModel: result.modelUsed,
              solutionGenerating: false,
              solutionError: undefined,
            });
          } catch (err) {
            if (ctrl.signal.aborted) return;
            if ((err as Error).name === "AbortError") return;
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
