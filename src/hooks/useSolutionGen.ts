import { useEffect, useMemo, useRef } from "react";
import { pLimitWithGap, withRetry } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { reportError } from "@app/lib/errorReporter";
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
  // 학년 fragment key — buildSolutionPrompt 에 prop drill 해서 학년별 단원
  // 함정 표가 prompt 에 inject 되게 함. null 이면 공통 검증 절차만.
  const selectedGrade = useWizardStore((s) => s.selectedGrade);
  // 해설 스킵 — true 면 자동발사 차단. 사용자가 "해설 생성하기" 로 해제하면
  // skipSolutions 가 false 가 되고 effect 가 재실행돼 자연스럽게 dispatch 시작.
  const skipSolutions = useWizardStore((s) => s.skipSolutions);
  // pLimitWithGap(1, 1500) — Sonnet 4.6 의 분당 RPM/TPM 한계 (Tier 1 기준
  // RPM 50, OTPM 8k) 가 한 시험지 (30 문항) 에 대해 빠르게 차서 429 폭발.
  // 사용자 보고: 10+ 429
  // 연속 발생 후 ERR_ABORTED. pLimit(1) 만으로는 부족 — 한 호출이 빠르게
  // 끝나면 직후 다음 호출이 0초 간격으로 발사돼 RPM 폭주. minGap 1500 ms
  // 으로 RPM ~ 40 자연 제한. Tier 2 로 업그레이드 (RPM 1000) 하면 이 값을
  // 500 또는 0 으로 줄일 수 있음. 사용자가 Tier 1 일 때 안전한 디폴트.
  const limit = useMemo(() => pLimitWithGap(1, 1500), []);

  // Track which (pageId, itemId) pairs were dispatched on THIS mount so we
  // don't re-fire on every re-render.
  const dispatched = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (skipSolutions) return; // 해설 건너뛰기 — 자동 해설 생성 차단 (재진입·Stepper 클릭 포함).
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
        // solutionGenerating: true 는 dispatched 직후 set — 큐 대기 포함. 실제
        // 호출 시작 시점은 limit() async fn 첫 줄의 solutionStartedAt 으로 구분.
        updateOCRItem(page.id, item.id, { solutionGenerating: true });
        void limit(async () => {
          if (!dispatched.current.has(key)) return;
          // 실제 호출 시작 — 사용자 UI 의 "대기 중" → "생성 중 · 12s" 전환 신호.
          updateOCRItem(page.id, item.id, { solutionStartedAt: Date.now() });
          try {
            const result = await withRetry(() =>
              generateSolution({
                problem: { text: item.text, topic: item.topic },
                grade: selectedGrade,
              }),
            );
            if (!dispatched.current.has(key)) return;

            // Phase G: Pattern J 등 validator warning 검출 시 *1회 자동 재생성*.
            // 결과 저장 안 하고 dispatched 마커만 해제 + autoRetried=true 표시 →
            // 다음 effect cycle 에서 *재dispatch* 되어 새 해설 생성. 두 번째도
            // warnings 가 있어도 그대로 노출 (사용자가 수동 결정).
            const hasWarnings = (result.warnings?.length ?? 0) > 0;
            const shouldAutoRetry = hasWarnings && !item.solutionAutoRetried;
            if (shouldAutoRetry) {
              dispatched.current.delete(key);
              updateOCRItem(page.id, item.id, {
                solution: undefined,
                answer: undefined,
                solutionWarnings: undefined,
                solutionModel: undefined,
                solutionGenerating: false,
                solutionStartedAt: undefined,
                solutionError: undefined,
                solutionAutoRetried: true,
              });
              // eslint-disable-next-line no-console
              if (import.meta.env.DEV) {
                console.debug(
                  `[useSolutionGen] auto-retry page=${page.id} item=${item.number} (${result.warnings?.length ?? 0} warnings)`,
                );
              }
              return;
            }

            updateOCRItem(page.id, item.id, {
              solution: result.solution,
              answer: result.answer,
              solutionModel: result.modelUsed,
              solutionGenerating: false,
              solutionStartedAt: undefined,
              solutionError: undefined,
              // 정확도 휴리스틱 검증 결과 — UI 에서 warning banner 표시.
              // 풀이가 통과하면 undefined 로 clear.
              solutionWarnings:
                result.warnings && result.warnings.length > 0
                  ? result.warnings.map((w) => ({
                      rule: w.rule,
                      summary: w.summary,
                      detail: w.detail,
                    }))
                  : undefined,
            });
          } catch (err) {
            if (!dispatched.current.has(key)) return;
            // eslint-disable-next-line no-console
            console.error(
              `[useSolutionGen] 페이지 ${page.id} 문항 ${item.number} 해설 실패`,
              err,
            );
            reportError(err, {
              kind: "solution",
              extra: { hook: "useSolutionGen", pageId: page.id, itemId: item.id, number: item.number },
            });
            updateOCRItem(page.id, item.id, {
              solutionError: friendlyError(err),
              solutionGenerating: false,
              solutionStartedAt: undefined,
            });
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, skipSolutions]);

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
