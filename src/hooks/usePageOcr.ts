import { useEffect, useMemo, useRef } from "react";
import { getPageImage } from "@app/lib/imageStore";
import { applyRotation } from "@app/lib/pdfProcessor";
import { pLimit, withRetry } from "@app/lib/concurrency";
import { extractPageProblems, type OCRModel } from "@app/services/ai/ocr";
import {
  GEMINI_3_1_FLASH_LITE,
  GEMINI_3_1_PRO,
  GEMINI_3_5_FLASH,
  GEMINI_3_FLASH,
  isGeminiAvailable,
} from "@app/services/ai/gemini";
import { GPT_5_5, isOpenAIAvailable } from "@app/services/ai/openai";
import { SONNET_MODEL, OPUS_MODEL } from "@app/services/ai/client";
import { useWizardStore, type OCRProblem, type WizardPage } from "@app/stores/wizardStore";

/**
 * Routing policy for the two-pass OCR pipeline — primary + fallback chain
 * per pass. 사용자 확정 정책:
 *
 *   - Pass 1 (every page, 일반 텍스트):
 *       1차 시도: **Gemini 3 Flash (Preview)** — 빠르고 저렴, multi-problem
 *                 페이지 본문 추출 안정.
 *       폴백:    **Gemini 3.5 Flash** (정식, 한 단계 위) — 1차가 throw 한
 *                 경우 (rate limit / 응답 깨짐 / TPM 초과 등) 자동 재시도.
 *
 *   - Pass 2 (figure pages, 도형):
 *       1차 시도: **GPT-5.5** — 도형 페이지에서 가장 풍부한 detail.
 *       폴백:    **Gemini 3.1 Pro (Preview)** — 1차가 throw 했을 때
 *                 (TPM 한도 / 일시 장애 등) 도형 품질이 높은 대안.
 *
 * 폴백 동작: 1차 호출이 *non-abort* error throw 하면 즉시 폴백 모델로 같은
 * 페이지를 다시 호출. AbortError 는 폴백 안 함 (사용자가 취소한 거니까).
 *
 * 키가 없는 provider 가 있으면 가능한 체인만 사용 (예: OpenAI 키 없으면
 * Pass 2 의 1차를 건너뛰고 Gemini 3.1 Pro 부터 시작).
 */
const pickPass1Chain = (): OCRModel[] => {
  const chain: OCRModel[] = [];
  if (isGeminiAvailable()) {
    chain.push(GEMINI_3_FLASH);
    chain.push(GEMINI_3_5_FLASH);
  } else {
    chain.push(SONNET_MODEL);
  }
  return chain;
};
const pickPass2Chain = (): OCRModel[] => {
  const chain: OCRModel[] = [];
  if (isOpenAIAvailable()) chain.push(GPT_5_5);
  if (isGeminiAvailable()) chain.push(GEMINI_3_1_PRO);
  if (chain.length === 0) chain.push(OPUS_MODEL);
  return chain;
};

/**
 * Pass-1 모델로 분류되어 도형 페이지에서 upgrade 트리거 대상이 되는 모델.
 * 1차 체인의 모든 모델 + 과거 라우팅 변경 이력 (Flash-Lite, Sonnet) 도 모두
 * 포함해서 마이그레이션 이전에 저장된 결과도 upgrade 가능하도록 함.
 */
const isPass1Model = (m?: string): boolean =>
  m === undefined ||
  m === GEMINI_3_FLASH ||
  m === GEMINI_3_5_FLASH ||
  m === GEMINI_3_1_FLASH_LITE ||
  m === SONNET_MODEL ||
  m === "claude-sonnet-4-6";

/**
 * Does this OCR result contain a figure we'd want Opus to re-verify?
 * A page has a figure when ANY item either:
 *   - has at least one fallback bbox crop (`images[]`), OR
 *   - has inline `<svg>` directly embedded in its text by Sonnet.
 */
const pageHasFigures = (items: OCRProblem[]): boolean =>
  items.some(
    (it) => (it.images && it.images.length > 0) || /<svg[\s>]/i.test(it.text),
  );

/**
 * Drives Step 2's per-page OCR fan-out.
 *
 * Lifecycle: mounted by `Step2OCRReview`. On every change to the pages array
 * we walk it and dispatch OCR for any page that hasn't already resolved
 * (ocrComplete=false AND ocrError missing). At most 2 calls are in flight
 * at once (`pLimit(2)`); the rest queue.
 *
 * **Two-pass model strategy** (multi-round benchmarking 으로 굳어진 라우팅):
 *
 *   1. First pass — 모든 문제 페이지를 **Gemini 3.5 Flash** 로 처리.
 *      정식 출시된 가장 똑똑한 Gemini Flash. Multi-problem 페이지 본문
 *      추출이 안정적이고 Sonnet 대비 비용도 낮음.
 *   2. Second pass — 1차 결과에 도형이 있으면 (inline `<svg>` 또는
 *      `images[]` bbox 존재) 같은 페이지를 **Gemini 3.1 Pro (Preview)** 로
 *      재추출하고 항목을 REPLACE. 텍스트만 있는 페이지는 2차 skip.
 *
 *   Pass 2 skip-conditions:
 *     - 페이지에 도형 없음 — 1차로 충분.
 *     - 사용자가 이미 어느 항목이라도 reviewed=true 로 만짐 — 사용자 편집
 *       유지 위해 2차 중단.
 *     - 페이지가 이미 Pro 결과 (`ocrModel === pass2Model`) — 무한 루프 방지.
 *
 * Three abort guards:
 *   1. AbortController is created in the effect — its `abort()` runs in the
 *      cleanup, so unmounting Step 2 cancels everything.
 *   2. Each queued worker re-checks `signal.aborted` BEFORE calling
 *      `getPageImage` / `extractPageProblems` — pLimit can still call our
 *      thunk after unmount if it had been queued.
 *   3. `extractPageProblems` itself passes the signal into the SDK so an
 *      in-flight HTTP request gets cancelled at the transport.
 *
 * Pages flagged `isProblemPage: false` and not `forceOcr: true` short-circuit
 * to `{ ocrResult: [], ocrComplete: true }` — surfaced by the UI as a "스킵"
 * banner with a "강제 OCR" escape hatch.
 */
export const usePageOcr = () => {
  const pages = useWizardStore((s) => s.pages);
  const setPageOCR = useWizardStore((s) => s.setPageOCR);
  const limit = useMemo(() => pLimit(2), []);

  // Track which page ids are *currently in flight* so a re-render doesn't
  // double-dispatch the same page mid-call. We intentionally clear the
  // marker in the worker's `finally`, so a page that ever finishes (success,
  // error, or abort) becomes re-dispatchable as soon as its store state
  // says it should run again (e.g. `ocrComplete: false` after a retry, or
  // a fresh PDF upload that reused the same `pg-N` id).
  //
  // Old footgun: this was a "ever-dispatched" set. Re-uploading a PDF
  // produced pages with identical ids (`pg-1`, `pg-2`, …), found their ids
  // already in the set, and silently skipped OCR — 0/N forever. The
  // dedicated `resetDispatch()` helper still exists as an escape hatch for
  // explicit retry flows that mutate store *without* going through the
  // worker's finally.
  const dispatched = useRef<Set<string>>(new Set());
  const upgradeDispatched = useRef<Set<string>>(new Set());

  // CRITICAL: AbortController must live for the ENTIRE component mount, NOT
  // per-effect-cycle. The hook fires `setPageOCR(..., { upgrading: true })`
  // which mutates the `pages` array — that re-triggers this useEffect's
  // cleanup, which (in the old code) called `ctrl.abort()` and killed the
  // Opus request we had just started, exactly one tick after dispatching it.
  // Result: Opus traffic was 0 even though the logic was "correct" on paper.
  // By tying the controller to a ref initialised once + a dedicated unmount
  // effect, we get the abort guarantees on real teardown without sabotaging
  // mid-flight requests on routine state updates.
  const ctrlRef = useRef<AbortController | null>(null);
  if (ctrlRef.current === null) ctrlRef.current = new AbortController();

  useEffect(() => {
    // StrictMode-safe cleanup: cancel in-flight work AND reset the
    // controller + dispatched markers so the *next* mount starts fresh.
    //
    // Old footgun: with only `ctrlRef.current?.abort()`, StrictMode's
    // mount → unmount → mount sequence aborted the controller on the
    // first cleanup, then on the second mount the same already-aborted
    // controller was reused (the `=== null` guard didn't trigger). Every
    // worker's `ctrl.signal.aborted` was true before the first await,
    // so `runOcrChain` returned `null` immediately and OCR sat at 0/N
    // forever with INFLIGHT markers but no actual work. Production
    // builds didn't see this because StrictMode only double-mounts in
    // dev. Resetting to `null` here forces the body-level `if` above
    // to allocate a fresh controller on the next render — symmetric
    // with our "fresh state on remount" intent.
    return () => {
      ctrlRef.current?.abort();
      ctrlRef.current = null;
      dispatched.current.clear();
      upgradeDispatched.current.clear();
    };
  }, []);

  useEffect(() => {
    const ctrl = ctrlRef.current!;
    const pass1Chain = pickPass1Chain();
    const pass2Chain = pickPass2Chain();

    // DEV-only progress log so the user can see at a glance whether
    // dispatch is happening, who's in-flight, and what's complete.
    // Quiet in production builds.
    if (import.meta.env.DEV) {
      const summary = pages
        .map((p) => {
          const flags = [
            `isProb=${p.isProblemPage}`,
            p.forceOcr ? "force" : null,
            `complete=${p.ocrComplete}`,
            p.ocrError ? `ERR` : null,
            dispatched.current.has(p.id) ? "INFLIGHT" : null,
            p.upgrading ? "upgrading" : null,
          ]
            .filter(Boolean)
            .join(" ");
          return `${p.id}[rot=${p.rotation}] ${flags}`;
        })
        .join("  |  ");
      // eslint-disable-next-line no-console
      console.log(`[usePageOcr] ${summary}`);
    }


    /**
     * 한 페이지를 모델 체인 순서대로 시도 — 1차가 throw 하면 자동으로 다음
     * 모델로 폴백. 끝까지 모두 실패하면 마지막 에러를 throw. AbortError 는
     * 폴백 안 함 (사용자 취소 의도 존중).
     *
     * 반환: `{ items, modelUsed }` — 어떤 모델이 결과를 만들었는지 함께
     * 돌려줘서 store 에 `ocrModel` 기록할 수 있게 함.
     */
    const runOcrChain = async (
      page: WizardPage,
      chain: OCRModel[],
      passLabel: string,
    ): Promise<{ items: OCRProblem[]; modelUsed: OCRModel } | null> => {
      if (ctrl.signal.aborted) return null;
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(`[usePageOcr] ${page.id} ${passLabel} ▶ getPageImage`);
      }
      // 이전에 관찰된 footgun: idb 의 `db.get()` 이 어떤 환경 (다른 탭이
      // 같은 DB 를 잡고 있거나 upgrade event 가 미완료된 상태, 또는 dev
      // HMR cascade 로 메인 스레드가 starved 된 상태) 에서 영구 pending
      // 으로 끝남. await 가 settle 안 되면 worker 전체가 hang, OCR 가
      // 0/N 에서 멈춤. 명시적 timeout 으로 hang → throw 변환.
      const IDB_TIMEOUT_MS = 8000;
      const image = await Promise.race([
        getPageImage(page.imageRef),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `IndexedDB read timeout (${IDB_TIMEOUT_MS}ms) — DB 가 다른 탭에 ` +
                    `locked 됐거나 upgrade 가 멈춰있을 수 있습니다. F12 → Application ` +
                    `→ Storage → "Clear site data" 후 PDF 다시 업로드.`,
                ),
              ),
            IDB_TIMEOUT_MS,
          ),
        ),
      ]);
      if (ctrl.signal.aborted) return null;
      if (!image) throw new Error("페이지 이미지를 찾을 수 없습니다. (IndexedDB에서 만료)");
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(
          `[usePageOcr] ${page.id} ${passLabel} ✓ image loaded (${image.dataUrl.length} chars) — calling model`,
        );
      }

      // 회전 적용 — 0° 면 fast-path 로 원본 그대로. 90/180/270 이면 canvas
      // redraw 한 번. 페이지마다 한 번씩만 호출되므로 성능 무관.
      const rotated =
        page.rotation === 0 ? image.dataUrl : await applyRotation(image.dataUrl, page.rotation);

      let lastErr: Error | null = null;
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        if (ctrl.signal.aborted) return null;
        // In-flight 모델 표시 — DEV 빌드에서 UI 가 보고 배지 띄움. 폴백
        // 발생 시 새 모델로 갱신, 성공·실패 시 finally 에서 unset.
        setPageOCR(page.id, { ocrInflightModel: model });
        try {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log(`[usePageOcr] ${page.id} ${passLabel} → ${model}: extractPageProblems()`);
          }
          const result = await withRetry(() =>
            extractPageProblems({
              pageBase64: rotated,
              textLayer: page.textLayer,
              signal: ctrl.signal,
              model,
            }),
          );
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log(
              `[usePageOcr] ${page.id} ${passLabel} ← ${model} OK (${result.items.length} items)`,
            );
          }
          if (i > 0) {
            // eslint-disable-next-line no-console
            console.info(
              `[usePageOcr] ${passLabel} 페이지 ${page.id}: ${chain[0]} 실패 → ${model} 폴백 성공`,
            );
          }
          setPageOCR(page.id, { ocrInflightModel: undefined });
          return { items: result.items, modelUsed: model };
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            setPageOCR(page.id, { ocrInflightModel: undefined });
            throw err;
          }
          if (ctrl.signal.aborted) {
            setPageOCR(page.id, { ocrInflightModel: undefined });
            return null;
          }
          lastErr = err as Error;
          // eslint-disable-next-line no-console
          console.warn(
            `[usePageOcr] ${passLabel} 페이지 ${page.id} 모델 ${model} 실패` +
              (i < chain.length - 1 ? ` → 다음 폴백 시도` : ` (체인 끝)`),
            err,
          );
        }
      }
      setPageOCR(page.id, { ocrInflightModel: undefined });
      throw lastErr ?? new Error("모든 모델 실패");
    };

    pages.forEach((page) => {
      // ── Pass 1: 일반 텍스트 OCR (3 Flash Preview → 3.5 Flash 폴백) ──
      if (!page.ocrComplete && !page.ocrError && !dispatched.current.has(page.id)) {
        if (!page.isProblemPage && !page.forceOcr) {
          dispatched.current.add(page.id);
          setPageOCR(page.id, { ocrResult: [], ocrComplete: true });
          return;
        }
        dispatched.current.add(page.id);
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log(`[usePageOcr] ${page.id} → dispatch (pass 1)`);
        }
        void limit(async () => {
          try {
            const result = await runOcrChain(page, pass1Chain, "1차");
            if (!result || ctrl.signal.aborted) return;
            setPageOCR(page.id, {
              ocrResult: result.items,
              ocrComplete: true,
              ocrModel: result.modelUsed as WizardPage["ocrModel"],
            });
          } catch (err) {
            if (ctrl.signal.aborted) return;
            if ((err as Error).name === "AbortError") return;
            // eslint-disable-next-line no-console
            console.error(`[usePageOcr] 페이지 ${page.id} 1차 실패 (전 체인)`, err);
            setPageOCR(page.id, {
              ocrError: (err as Error).message || "알 수 없는 오류",
              ocrComplete: true,
            });
          } finally {
            // Free the in-flight slot so a future store change
            // (`ocrComplete: false` from retry, new PDF upload, etc.) can
            // re-dispatch this page id without a manual resetDispatch call.
            dispatched.current.delete(page.id);
          }
        });
        return;
      }

      // ── Pass 2: 도형 페이지 정밀 분석 (GPT-5.5 → Gemini 3.1 Pro 폴백) ──
      // 1차가 깔끔히 끝났고 도형이 있는 페이지만 트리거. 이미 도형 체인의
      // 어떤 모델로라도 처리된 페이지는 skip (무한 루프 방지).
      const alreadyUpgraded = pass2Chain.includes(page.ocrModel as OCRModel);
      const eligibleForUpgrade =
        page.ocrComplete &&
        !page.ocrError &&
        !page.upgrading &&
        isPass1Model(page.ocrModel) &&
        !alreadyUpgraded &&
        pageHasFigures(page.ocrResult) &&
        !page.ocrResult.some((it) => it.reviewed) && // preserve user edits
        !upgradeDispatched.current.has(page.id);

      if (!eligibleForUpgrade) return;

      upgradeDispatched.current.add(page.id);
      setPageOCR(page.id, { upgrading: true });
      void limit(async () => {
        try {
          const result = await runOcrChain(page, pass2Chain, "2차");
          if (!result || ctrl.signal.aborted) return;
          setPageOCR(page.id, {
            ocrResult: result.items,
            ocrModel: result.modelUsed as WizardPage["ocrModel"],
            upgrading: false,
          });
        } catch (err) {
          if (ctrl.signal.aborted) return;
          if ((err as Error).name === "AbortError") return;
          // 2차 실패는 fatal 아님 — 1차 결과 그대로 보존하고 spinner 해제.
          // eslint-disable-next-line no-console
          console.warn(`[usePageOcr] 페이지 ${page.id} 2차 전 체인 실패 (1차 결과 유지)`, err);
          setPageOCR(page.id, { upgrading: false });
        } finally {
          // Symmetric with the pass-1 marker — clear so a future retry
          // (e.g. user manually re-triggers Opus) can run again.
          upgradeDispatched.current.delete(page.id);
        }
      });
    });

    // NOTE: no cleanup that aborts here — the controller lives across all
    // effect cycles via ctrlRef. Re-runs of this effect (caused by pages
    // updates from our own setPageOCR calls) must NOT kill in-flight work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  /**
   * Clear dispatched markers for a page so the next effect cycle re-picks it
   * up. Without this, "페이지 재인식" or rotation-triggered reset would set
   * `ocrComplete: false` but the dispatched Set still has the id and skips
   * the page forever — effectively bricking that page until reload.
   *
   * Callers: Step2OCRReview's `requestRetry` / `forcePageOcr`, and the
   * rotation button in PageThumbColumn (rotation already invalidates OCR
   * state via `setPageRotation`, but the dispatched marker stays).
   */
  const resetDispatch = (pageId: string): void => {
    dispatched.current.delete(pageId);
    upgradeDispatched.current.delete(pageId);
  };

  return { resetDispatch };
};
