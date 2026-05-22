import { useEffect, useMemo, useRef } from "react";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation } from "@app/lib/pdfProcessor";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
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
    (it) =>
      (it.images && it.images.length > 0) ||
      (it.diagramParams && it.diagramParams.length > 0) ||
      /<svg[\s>]/i.test(it.text),
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
  // **Pass1 / Pass2 limit 분리** — 같은 limit 슬롯을 공유하면 도형 페이지의 느린
  // Pass2 (GPT-5.5, 30~60s) 가 *다른 페이지의 Pass1* 까지 막아 사용자가 stuck
  // 으로 인식. 분리 후:
  //   - Pass1 = pLimit(3) — Gemini Free Tier RPM 15 / TPM 1M 한도 안전 내.
  //     3 페이지 시험지면 동시 처리로 시간 약 50% 단축.
  //   - Pass2 = pLimit(1) — 느린 모델은 동시 1 개만. Pass1 슬롯 안 잡아먹음.
  const pass1Limit = useMemo(() => pLimit(3), []);
  const pass2Limit = useMemo(() => pLimit(1), []);

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

  // 한 때 mount-lifetime AbortController 로 in-flight HTTP 를 cancel 했지만,
  // React 19 StrictMode / HMR / 부모 conditional render 가 unmount 를 시뮬레이트
  // 할 때마다 abort 가 발동 → 워커가 `ctrl.signal.aborted` 분기로 silently
  // 빠져나오고 finally 가 dispatched 마커를 비움 → 다음 effect cycle 이 같은
  // 페이지를 다시 dispatch. 이게 사용자가 보고 한 "INFLIGHT → 마커 사라짐 → 재
  // dispatch" 무한 루프의 원인이었다 (워커가 "✓ image loaded" 로그 직전에서
  // bail).
  //
  // 해결: AbortController 자체를 제거. 명시적 cancel 은 `resetDispatch()` 에서
  // 마커를 지우는 것으로 충분. 워커가 자연스럽게 완료되어 setPageOCR 까지
  // 도달하면 store 가 결과를 받고, 페이지가 이미 사라졌다면 zustand 의 `map`
  // 매처가 no-op. 실제 unmount 중 in-flight HTTP 한 번 분의 비용은 감수.
  const pass1Chain = useMemo(pickPass1Chain, []);
  const pass2Chain = useMemo(pickPass2Chain, []);

  useEffect(() => {
    /**
     * 한 페이지를 모델 체인 순서대로 시도 — 1차가 throw 하면 자동으로 다음
     * 모델로 폴백. 끝까지 모두 실패하면 마지막 에러를 throw.
     *
     * Cancellation: 모든 await 직후 `dispatched.current.has(page.id)` 를
     * 체크. 마커가 사라졌다는 건 `resetDispatch(page.id)` 가 명시적으로
     * 호출됐다는 뜻 (사용자 retry 또는 회전) — 그 경우 silently return.
     *
     * 반환: `{ items, modelUsed }` — 어떤 모델이 결과를 만들었는지 함께
     * 돌려줘서 store 에 `ocrModel` 기록할 수 있게 함.
     */
    const isCancelled = (pageId: string, marker: "pass1" | "pass2"): boolean =>
      marker === "pass1"
        ? !dispatched.current.has(pageId)
        : !upgradeDispatched.current.has(pageId);

    const runOcrChain = async (
      page: WizardPage,
      chain: OCRModel[],
      passLabel: string,
      marker: "pass1" | "pass2",
    ): Promise<{ items: OCRProblem[]; modelUsed: OCRModel } | null> => {
      if (isCancelled(page.id, marker)) return null;
      // 페이지 이미지 dataURL 확보. 일반 경로는 IndexedDB(`imageRef`), "이어서
      // 작업" 으로 hydrate 된 페이지(`imageRef` 빈 문자열)는 Supabase Storage
      // 에서 lazy 복원해 IndexedDB 에 캐시한다.
      let imageDataUrl: string;
      if (!page.imageRef) {
        const restored = await ensurePageImage(page, getPageStoragePath(page.id));
        if (isCancelled(page.id, marker)) return null;
        if (!restored) {
          throw new Error(
            "페이지 이미지를 찾을 수 없습니다. (Storage 복원 실패 — 재OCR 불가)",
          );
        }
        // 복원한 IndexedDB ref 를 store 에 저장 — 다음 재OCR 시 재다운로드 방지.
        setPageOCR(page.id, { imageRef: restored.ref });
        imageDataUrl = restored.dataUrl;
      } else {
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
        if (isCancelled(page.id, marker)) return null;
        if (!image) throw new Error("페이지 이미지를 찾을 수 없습니다. (IndexedDB에서 만료)");
        imageDataUrl = image.dataUrl;
      }

      // 회전 적용 — 0° 면 fast-path 로 원본 그대로. 90/180/270 이면 canvas
      // redraw 한 번. 페이지마다 한 번씩만 호출되므로 성능 무관.
      const rotated =
        page.rotation === 0 ? imageDataUrl : await applyRotation(imageDataUrl, page.rotation);

      let lastErr: Error | null = null;
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        if (isCancelled(page.id, marker)) return null;
        // In-flight 모델 + 시작 timestamp 표시. PageThumbColumn 의 경과 시간
        // 표시에 사용. 폴백 시 timestamp 도 갱신 (새 모델 시작 시각 기준).
        setPageOCR(page.id, { ocrInflightModel: model, ocrStartedAt: Date.now() });
        try {
          const result = await withRetry(() =>
            extractPageProblems({
              pageBase64: rotated,
              textLayer: page.textLayer,
              model,
            }),
          );
          if (i > 0) {
            // eslint-disable-next-line no-console
            console.info(
              `[usePageOcr] ${passLabel} 페이지 ${page.id}: ${chain[0]} 실패 → ${model} 폴백 성공`,
            );
          }
          setPageOCR(page.id, { ocrInflightModel: undefined, ocrStartedAt: undefined });
          return { items: result.items, modelUsed: model };
        } catch (err) {
          if (isCancelled(page.id, marker)) {
            setPageOCR(page.id, { ocrInflightModel: undefined, ocrStartedAt: undefined });
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
      setPageOCR(page.id, { ocrInflightModel: undefined, ocrStartedAt: undefined });
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
        const pass1Start = Date.now();
        void pass1Limit(async () => {
          try {
            const result = await runOcrChain(page, pass1Chain, "1차", "pass1");
            if (!result) return;
            // 각 item 에 페이지 모델 복사 — 문항별 모델 추적 (task #99).
            // 향후 item 별 재실행 (task #41) 시 그 item 만 업데이트 가능.
            const itemsWithModel = result.items.map((it) => ({
              ...it,
              ocrModel: result.modelUsed,
            }));
            setPageOCR(page.id, {
              ocrResult: itemsWithModel,
              ocrComplete: true,
              ocrModel: result.modelUsed as WizardPage["ocrModel"],
            });
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(
                `[usePageOcr] ${page.id} 1차 ${result.modelUsed} 완료 — ${((Date.now() - pass1Start) / 1000).toFixed(1)}s (${result.items.length} 문항)`,
              );
            }
          } catch (err) {
            if (isCancelled(page.id, "pass1")) return;
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
      const pass2Start = Date.now();
      void pass2Limit(async () => {
        try {
          const result = await runOcrChain(page, pass2Chain, "2차", "pass2");
          if (!result) return;
          // ── Item-level merge (사용자 보고 — task #99 보강) ──
          // 기존: Pass 2 결과를 *통째로* replace → 도형 없는 item (11/12 같은
          // 단순 텍스트 문제) 도 GPT-5.5 chip 으로 표시 → 사용자가 *비싼 모델
          // 낭비* 로 오인. 진짜 원인: 페이지 단위 Pass 2 라 *호출 결과의 모든
          // item* 이 GPT-5.5 출력.
          //
          // 새로: *도형 있는 item* (images.length > 0) 만 Pass 2 결과 + GPT-5.5
          // chip. 도형 없는 item 은 Pass 1 결과 + Pass 1 모델 chip 유지. 사용자
          // 인식 일치 + Pass 2 의 *도형 정밀화 가치* 만 살림.
          const currentPage = useWizardStore
            .getState()
            .pages.find((p) => p.id === page.id);
          const pass1Items = currentPage?.ocrResult ?? [];
          const pass2ByNumber = new Map<number, OCRProblem>(
            result.items.map((it) => [it.number, it]),
          );
          const merged: OCRProblem[] = [];
          for (const p1 of pass1Items) {
            const p2 = pass2ByNumber.get(p1.number);
            if (p2 && (p2.images?.length ?? 0) > 0) {
              // 도형 있음 → Pass 2 결과 사용
              merged.push({ ...p2, ocrModel: result.modelUsed });
            } else {
              // 도형 없음 → Pass 1 결과 + Pass 1 모델 chip 유지
              merged.push(p1);
            }
          }
          // Pass 2 만 검출한 item (Pass 1 누락) — append
          for (const p2 of result.items) {
            if (!pass1Items.some((p1) => p1.number === p2.number)) {
              merged.push({ ...p2, ocrModel: result.modelUsed });
            }
          }
          setPageOCR(page.id, {
            ocrResult: merged,
            ocrModel: result.modelUsed as WizardPage["ocrModel"],
            upgrading: false,
          });
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug(
              `[usePageOcr] ${page.id} 2차 ${result.modelUsed} 완료 — ${((Date.now() - pass2Start) / 1000).toFixed(1)}s (${result.items.length} 문항)`,
            );
          }
        } catch (err) {
          if (isCancelled(page.id, "pass2")) return;
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

    // NOTE: no abort here — see the comment above the marker `useRef` blocks.
    // Re-runs of this effect (caused by pages updates from our own setPageOCR
    // calls) must NOT kill in-flight work. Workers self-cancel via
    // `dispatched.current` membership checks; real cancellation goes through
    // `resetDispatch(page.id)`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  /**
   * Clear dispatched markers for a page so the next effect cycle re-picks it
   * up. Without this, "페이지 재인식" or rotation-triggered reset would set
   * `ocrComplete: false` but the dispatched Set still has the id and skips
   * the page forever — effectively bricking that page until reload.
   *
   * Callers: Step2OCRReview's `requestRetry` / `forcePageOcr`. (페이지 회전은
   * 업로드 단계 — OCR 이전 — 에서만 하므로 dispatched 마커와 무관하다.)
   */
  const resetDispatch = (pageId: string): void => {
    dispatched.current.delete(pageId);
    upgradeDispatched.current.delete(pageId);
  };

  return { resetDispatch };
};
