import { useEffect, useMemo, useRef } from "react";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation, cropPageImageData } from "@app/lib/pdfProcessor";
import { preprocessForOcr } from "@app/lib/imagePreprocess";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { pLimit, withRetry } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { reconcileChoicesMissingWithCrop } from "@app/lib/cropKindReconcile";
import { reportError } from "@app/lib/errorReporter";
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
 *   1. First pass — 모든 문제 페이지를 **Gemini 3 Flash / 3.5 Flash** 로 처리.
 *      정식 출시된 가장 똑똑한 Gemini Flash. Multi-problem 페이지 본문
 *      추출이 안정적이고 Sonnet 대비 비용도 낮음.
 *   2. Second pass (**Phase I-7b: cropped per-box**) — 1차 결과에 도형이 있는
 *      *각 문항 box* (Step 1.5 에서 사용자가 검증한 `cropBoxes`) 별로 *cropped
 *      image* 만 **GPT-5.5 / Gemini 3.1 Pro** 에 보내고 number 기준 merge.
 *      전체 페이지 image 를 보내던 옛 방식 대비 vision token 30~50% 절감 +
 *      검수 박스와 OCR 결과의 1:1 매칭 보장. 도형 없는 item 은 호출 자체 X.
 *
 *   Pass 2 skip-conditions:
 *     - 페이지에 도형 없음 — 1차로 충분.
 *     - `cropInspected !== true` — 사용자가 박스 검토 미완료 (legacy v2 세션은
 *       cropInspected === undefined 로 자동 통과).
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

      // 이미지 전처리 — CLAUDE.md §28-1 (사용자 결정 2026-05-27).
      //  · removeColorInk: 빨간/파란 마커 (학생 손글씨) → 흰색 replace
      //  · boostContrast: auto-contrast (factor 1.2)
      //  · upscaleImage: 2x bilinear (큰 페이지 skip)
      // 실패 시 원본 fallback — best-effort.
      const preprocessed = await preprocessForOcr(rotated);
      if (isCancelled(page.id, marker)) return null;

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
              pageBase64: preprocessed,
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
            // 크롭 분류(kind="essay") 권위 신호로 "보기 누락" 오경고 제거.
            // 검수에서 서술형으로 크롭된 문항인데 OCR 텍스트 휴리스틱이 객관식
            // 으로 오인한 케이스 정정 (CLAUDE.md §18 류 SERIOUS, 2026-06-02).
            const reconciled = reconcileChoicesMissingWithCrop(
              itemsWithModel,
              page.cropBoxes,
            );
            setPageOCR(page.id, {
              ocrResult: reconciled,
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
              ocrError: (() => {
                reportError(err, {
                  kind: "ocr",
                  extra: { hook: "usePageOcr", pageId: page.id },
                });
                return friendlyError(err);
              })(),
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

      // ── Pass 2: cropped 도형 박스 *per-box* OCR ──
      // Phase I-7b (사용자 결정 — 비용 절감 + 검수 일관성): Pass 2 가 더 이상
      // 전체 페이지 image 를 보내지 않는다. 대신 사용자가 Step 1.5 에서 검증한
      // *문항 박스* (class="problem", verified=true) 마다 *cropped image* 만
      // Pass 2 모델 (GPT-5.5 / Gemini 3.1 Pro) 에 보내고, 결과를 number 기준
      // merge. 도형 없는 item 은 호출조차 안 함 → vision token 30~50% 절감
      // 목표.
      //
      // 트리거 조건:
      //   - Pass 1 완료 + 에러 없음
      //   - cropInspected === true (사용자가 박스 검토 완료)
      //     ※ legacy v2 (undefined) 도 통과 — 옛 session 호환
      //   - 적어도 한 item 에 도형 (images.length > 0 또는 inline <svg> 또는
      //     diagramParams) 존재
      //   - 사용자가 어떤 item 도 reviewed=true 로 만지지 않음
      //   - 페이지가 아직 Pass 2 모델로 처리되지 않음 (무한 루프 방지)
      const cropInspectionOK =
        page.cropInspected === undefined ||
        page.cropInspected === true;
      const alreadyUpgraded = pass2Chain.includes(page.ocrModel as OCRModel);
      const eligibleForUpgrade =
        page.ocrComplete &&
        !page.ocrError &&
        !page.upgrading &&
        isPass1Model(page.ocrModel) &&
        !alreadyUpgraded &&
        pageHasFigures(page.ocrResult) &&
        cropInspectionOK &&
        !page.ocrResult.some((it) => it.reviewed) && // preserve user edits
        !upgradeDispatched.current.has(page.id);

      if (!eligibleForUpgrade) return;

      upgradeDispatched.current.add(page.id);
      setPageOCR(page.id, { upgrading: true });
      const pass2Start = Date.now();
      void pass2Limit(async () => {
        try {
          // ── (1) 페이지 이미지 + 회전 한 번만 로드 (모든 box crop 재사용) ──
          let pageImageDataUrl: string;
          if (!page.imageRef) {
            const restored = await ensurePageImage(page, getPageStoragePath(page.id));
            if (isCancelled(page.id, "pass2")) return;
            if (!restored) {
              throw new Error(
                "페이지 이미지를 찾을 수 없습니다. (Storage 복원 실패 — 재OCR 불가)",
              );
            }
            setPageOCR(page.id, { imageRef: restored.ref });
            pageImageDataUrl = restored.dataUrl;
          } else {
            const IDB_TIMEOUT_MS = 8000;
            const image = await Promise.race([
              getPageImage(page.imageRef),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () =>
                    reject(
                      new Error(
                        `IndexedDB read timeout (${IDB_TIMEOUT_MS}ms) — DB 가 다른 탭에 ` +
                          `locked 됐거나 upgrade 가 멈춰있을 수 있습니다.`,
                      ),
                    ),
                  IDB_TIMEOUT_MS,
                ),
              ),
            ]);
            if (isCancelled(page.id, "pass2")) return;
            if (!image) throw new Error("페이지 이미지를 찾을 수 없습니다. (IndexedDB에서 만료)");
            pageImageDataUrl = image.dataUrl;
          }
          const rotatedPage =
            page.rotation === 0
              ? pageImageDataUrl
              : await applyRotation(pageImageDataUrl, page.rotation);

          // ── (2) 검증된 문항 박스 + Pass 1 의 도형 item 추출 ──
          const problemBoxes = (page.cropBoxes ?? []).filter(
            (b) => b.class === "problem" && typeof b.number === "number",
          );
          const pass1Items = page.ocrResult;
          const figureItems = pass1Items.filter(
            (it) =>
              (it.images && it.images.length > 0) ||
              (it.diagramParams && it.diagramParams.length > 0) ||
              /<svg[\s>]/i.test(it.text),
          );

          if (figureItems.length === 0) {
            // eligibility 가 잡았어야 하지만 safety net.
            setPageOCR(page.id, { upgrading: false });
            return;
          }

          // ── (3) 각 figure item 별 cropped Pass 2 호출 ──
          // upgradedByNumber: 문항번호 → 새 OCRProblem (Pass 2 결과).
          // 매칭 박스 없거나 모든 체인 실패한 item 은 Pass 1 그대로 유지.
          const upgradedByNumber = new Map<number, OCRProblem>();
          let lastModelUsed: OCRModel | null = null;

          for (const figItem of figureItems) {
            if (isCancelled(page.id, "pass2")) return;

            // 매칭 박스 (number 기준). 없으면 Pass 1 보존 — Step 1.5 에서
            // 사용자가 해당 문항 박스를 삭제했거나 만들지 않았다는 뜻.
            const matchingBox = problemBoxes.find((b) => b.number === figItem.number);
            if (!matchingBox) {
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.debug(
                  `[usePageOcr] ${page.id} item ${figItem.number}: 매칭 박스 없음 — Pass 1 보존`,
                );
              }
              continue;
            }

            // 박스 영역만 crop. 박스 좌표는 0-1000 정규화. 2% margin 추가 안전망.
            let croppedImage: string;
            try {
              croppedImage = await cropPageImageData(rotatedPage, matchingBox.bbox, {
                margin: 0.02,
              });
              // 이미지 전처리 적용 (Pass 1 과 동일 — CLAUDE.md §28-1).
              // cropped 영역도 손글씨 잉크 / contrast / upscale 보강.
              croppedImage = await preprocessForOcr(croppedImage);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(
                `[usePageOcr] ${page.id} item ${figItem.number} crop 실패 — Pass 1 유지`,
                err,
              );
              continue;
            }

            if (isCancelled(page.id, "pass2")) return;

            // 모델 체인 시도 — 1차 throw 면 다음 모델로 폴백.
            let lastErr: Error | null = null;
            for (let i = 0; i < pass2Chain.length; i++) {
              const model = pass2Chain[i];
              if (isCancelled(page.id, "pass2")) return;
              setPageOCR(page.id, { ocrInflightModel: model, ocrStartedAt: Date.now() });
              try {
                const result = await withRetry(() =>
                  extractPageProblems({
                    pageBase64: croppedImage,
                    textLayer: "", // 박스 영역 한정 hint 없음 — empty
                    model,
                  }),
                );
                if (i > 0) {
                  // eslint-disable-next-line no-console
                  console.info(
                    `[usePageOcr] 2차(크롭) ${page.id} item ${figItem.number}: ${pass2Chain[0]} → ${model} 폴백 성공`,
                  );
                }
                // 크롭 = 1 문제. number 매칭 우선, fallback items[0].
                const matched =
                  result.items.find((it) => it.number === figItem.number) ??
                  result.items[0];
                if (matched) {
                  upgradedByNumber.set(figItem.number, {
                    ...matched,
                    // 모델이 박스 안 번호를 잘못 읽을 수 있음 — 원래 번호 강제.
                    number: figItem.number,
                    ocrModel: model,
                  });
                  lastModelUsed = model;
                }
                break;
              } catch (err) {
                if (isCancelled(page.id, "pass2")) {
                  setPageOCR(page.id, {
                    ocrInflightModel: undefined,
                    ocrStartedAt: undefined,
                  });
                  return;
                }
                lastErr = err as Error;
                // eslint-disable-next-line no-console
                console.warn(
                  `[usePageOcr] 2차(크롭) ${page.id} item ${figItem.number} 모델 ${model} 실패` +
                    (i < pass2Chain.length - 1 ? ` → 다음 폴백 시도` : ` (체인 끝)`),
                  err,
                );
              }
            }
            // 한 box 실패는 fatal X — 다음 box 시도. 그 item 만 Pass 1 보존.
            if (!upgradedByNumber.has(figItem.number) && lastErr) {
              // eslint-disable-next-line no-console
              console.warn(
                `[usePageOcr] 2차(크롭) ${page.id} item ${figItem.number} 전 체인 실패 — Pass 1 유지`,
              );
            }
          }
          setPageOCR(page.id, { ocrInflightModel: undefined, ocrStartedAt: undefined });

          if (isCancelled(page.id, "pass2")) return;

          // ── (4) Merge — upgrade 된 figure item 만 replace, 나머지 Pass 1 그대로 ──
          const merged: OCRProblem[] = pass1Items.map(
            (p1) => upgradedByNumber.get(p1.number) ?? p1,
          );
          // Pass 2 재OCR 된 box 는 fresh choicesMissing 을 받으므로 크롭 분류
          // reconcile 을 다시 적용 (Pass 1 reconcile 은 비-upgrade item 만 보존).
          const mergedReconciled = reconcileChoicesMissingWithCrop(
            merged,
            page.cropBoxes,
          );

          setPageOCR(page.id, {
            ocrResult: mergedReconciled,
            // 적어도 1 box 가 upgrade 됐으면 page.ocrModel 도 Pass 2 모델로 갱신
            // (PageThumbColumn chip 표시 일관성). 모두 실패면 Pass 1 모델 유지.
            ocrModel: (lastModelUsed ?? page.ocrModel) as WizardPage["ocrModel"],
            upgrading: false,
          });
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug(
              `[usePageOcr] ${page.id} 2차(크롭) 완료 — ${((Date.now() - pass2Start) / 1000).toFixed(1)}s ` +
                `(${upgradedByNumber.size}/${figureItems.length} box upgrade)`,
            );
          }
        } catch (err) {
          if (isCancelled(page.id, "pass2")) return;
          // 2차 전반 실패 (이미지 로드 실패 등) — Pass 1 결과 유지, spinner 해제.
          // eslint-disable-next-line no-console
          console.warn(
            `[usePageOcr] 페이지 ${page.id} 2차(크롭) 전체 실패 (Pass 1 유지)`,
            err,
          );
          setPageOCR(page.id, { upgrading: false });
        } finally {
          // Symmetric with the pass-1 marker — clear so a future retry can run again.
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
