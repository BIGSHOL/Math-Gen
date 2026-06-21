import { useEffect, useMemo, useRef } from "react";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation, cropPageImageData } from "@app/lib/pdfProcessor";
import { remapBoxToFullPage } from "@app/lib/figureBoxRemap";
import { preprocessForOcr } from "@app/lib/imagePreprocess";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { pLimit, withRetry } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { reconcileChoicesMissingWithCrop } from "@app/lib/cropKindReconcile";
import { reportError } from "@app/lib/errorReporter";
import { extractPageProblems, type OCRModel } from "@app/services/ai/ocr";
import { GEMINI_3_1_PRO, GEMINI_3_5_FLASH, isGeminiAvailable } from "@app/services/ai/gemini";
import { SONNET_MODEL, OPUS_MODEL } from "@app/services/ai/client";
import {
  useWizardStore,
  type OCRProblem,
  type WizardPage,
  type CropBox,
} from "@app/stores/wizardStore";

/**
 * 크롭 margin — `cropPageImageData` 호출과 `remapBoxToFullPage` 가 *같은 값*을 써야
 * box 역변환이 정확. 한 곳에서만 정의(둘이 어긋나면 위치 배치가 미세하게 틀어짐).
 */
const CROP_MARGIN = 0.02;

/**
 * per-crop OCR 모델 체인 — 박스 complexity 로 라우팅.
 *   - simple/undefined → **Gemini 3.5 Flash** 단일 (사용자 확정 2026-06-20).
 *     Gemini 키 없으면 Sonnet 4.6 폴백.
 *   - complex (다중 시각요소·긴 서술형) → **Gemini 3.1 Pro** 단일 (도형 품질 보전).
 *     Gemini 키 없으면 Opus 폴백.
 * 폴백: 1차가 *non-abort* error throw 하면 다음 모델로. AbortError 는 폴백 안 함.
 */
const pickPass1Chain = (): OCRModel[] => {
  const chain: OCRModel[] = [];
  if (isGeminiAvailable()) chain.push(GEMINI_3_5_FLASH);
  else chain.push(SONNET_MODEL);
  return chain;
};
const pickPass2Chain = (): OCRModel[] => {
  const chain: OCRModel[] = [];
  if (isGeminiAvailable()) chain.push(GEMINI_3_1_PRO);
  if (chain.length === 0) chain.push(OPUS_MODEL);
  return chain;
};

/** 검증된 문제 박스 (class="problem" + number 보유). per-crop OCR 의 단위. */
type ProblemBox = CropBox & { number: number };

/**
 * Step 2 의 per-page OCR fan-out 을 구동.
 *
 * **per-crop OCR (testchange 방향, §per-crop)**: 페이지를 통째로 한 번 읽지 않고,
 * Step 1.5 에서 검증된 *문제 박스마다 1 OCR 콜* 을 보내 `box.number` 로 병합한다
 * (testchange `recognize_crop` 미러). 문항 격리(옆 문제 오염 0)·토큰 truncation 급감·
 * 크롭 검수가 OCR 입력을 직접 결정. 박스가 없는 페이지(legacy/검출 실패)는 *whole-page*
 * fallback 으로 안전하게 처리한다.
 *
 * 디스패치·완료신호(`page.ocrComplete`)·게이팅은 *페이지 단위* 유지 — 바뀐 것은 워커
 * 내부 OCR 전략(1 페이지콜 → N 크롭콜 병렬 + number 병합)뿐. 옛 2-pass(전체 페이지 Flash +
 * 도형 박스 Pro 재OCR)는 per-crop 에 흡수됐다(도형이 문제 크롭 안에 있음 + complexity 라우팅).
 *
 * Cancellation (§1-6-b — AbortController 금지): `dispatched` Set 멤버십이 유일한 취소
 * 신호. 모든 await 직후 `isCancelled(page.id)` 체크. 명시적 취소(재인식/회전)는
 * `resetDispatch(pageId)` 가 마커를 비운다. unmount 중 in-flight HTTP 한 번 분 cost 는 감수.
 *
 * 비-문항 페이지(`isProblemPage:false` & not `forceOcr`)는 `{ ocrResult:[], ocrComplete:true }`
 * 로 즉시 단락 — UI 가 "스킵" 배너 + "강제 OCR" 탈출구 표시.
 */
export const usePageOcr = () => {
  const pages = useWizardStore((s) => s.pages);
  const setPageOCR = useWizardStore((s) => s.setPageOCR);

  // 페이지 워커 디스패치 한도 — 각 워커는 자기 페이지의 크롭들을 cropLimit 통해 OCR.
  const pageLimit = useMemo(() => pLimit(2), []);
  // 크롭 OCR 콜 *전역* 한도 — 페이지 수 무관 동시 OCR ≤ 4 (Gemini RPM 보호).
  const cropLimit = useMemo(() => pLimit(4), []);

  // 현재 in-flight 페이지 id. re-render 가 같은 페이지를 이중 dispatch 하지 않게.
  // 워커 finally 에서 비움 → ocrComplete:false(재인식) / 새 업로드 시 자연 재dispatch.
  // (옛 footgun: "ever-dispatched" Set 은 PDF 재업로드 시 같은 id 재사용으로 0/N hang.)
  const dispatched = useRef<Set<string>>(new Set());

  const pass1Chain = useMemo(pickPass1Chain, []);
  const pass2Chain = useMemo(pickPass2Chain, []);

  useEffect(() => {
    const isCancelled = (pageId: string): boolean => !dispatched.current.has(pageId);

    /** 페이지 이미지 로드(IndexedDB → Storage fallback) + 회전. cancel 시 null. */
    const loadRotatedImage = async (page: WizardPage): Promise<string | null> => {
      if (isCancelled(page.id)) return null;
      let imageDataUrl: string;
      if (!page.imageRef) {
        // "이어서 작업" hydrate (imageRef 빈 문자열) → Supabase Storage 에서 lazy 복원.
        const restored = await ensurePageImage(page, getPageStoragePath(page.id));
        if (isCancelled(page.id)) return null;
        if (!restored) {
          throw new Error("페이지 이미지를 찾을 수 없습니다. (Storage 복원 실패 — 재OCR 불가)");
        }
        setPageOCR(page.id, { imageRef: restored.ref });
        imageDataUrl = restored.dataUrl;
      } else {
        // idb get() 이 어떤 환경(다른 탭 lock / upgrade 미완료 / dev HMR starvation)에서
        // 영구 pending → 워커 hang. 명시적 timeout 으로 hang → throw.
        const IDB_TIMEOUT_MS = 8000;
        const image = await Promise.race([
          getPageImage(page.imageRef),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `IndexedDB read timeout (${IDB_TIMEOUT_MS}ms) — DB 가 다른 탭에 locked 됐거나 ` +
                      `upgrade 가 멈춰있을 수 있습니다. F12 → Application → Storage → "Clear site ` +
                      `data" 후 PDF 다시 업로드.`,
                  ),
                ),
              IDB_TIMEOUT_MS,
            ),
          ),
        ]);
        if (isCancelled(page.id)) return null;
        if (!image) throw new Error("페이지 이미지를 찾을 수 없습니다. (IndexedDB에서 만료)");
        imageDataUrl = image.dataUrl;
      }
      if (isCancelled(page.id)) return null;
      // 회전 — 0° 면 fast-path. 90/180/270 이면 canvas redraw 1회.
      return page.rotation === 0 ? imageDataUrl : await applyRotation(imageDataUrl, page.rotation);
    };

    /**
     * 주어진 (전처리된) 이미지를 모델 체인 순서로 OCR. 1차 throw 면 다음 모델 폴백.
     * 끝까지 실패하면 마지막 에러 throw. cancel 시 null.
     */
    const ocrChainOnImage = async (
      page: WizardPage,
      imageBase64: string,
      chain: OCRModel[],
      opts: { crop: boolean; textLayer: string; label: string },
    ): Promise<{ items: OCRProblem[]; modelUsed: OCRModel } | null> => {
      let lastErr: Error | null = null;
      for (let i = 0; i < chain.length; i++) {
        const model = chain[i];
        if (isCancelled(page.id)) return null;
        try {
          const result = await withRetry(() =>
            extractPageProblems({
              pageBase64: imageBase64,
              textLayer: opts.textLayer,
              model,
              crop: opts.crop,
            }),
          );
          if (i > 0) {
            // eslint-disable-next-line no-console
            console.info(
              `[usePageOcr] ${opts.label} 페이지 ${page.id}: ${chain[0]} 실패 → ${model} 폴백 성공`,
            );
          }
          return { items: result.items, modelUsed: model };
        } catch (err) {
          if (isCancelled(page.id)) return null;
          lastErr = err as Error;
          // eslint-disable-next-line no-console
          console.warn(
            `[usePageOcr] ${opts.label} 페이지 ${page.id} 모델 ${model} 실패` +
              (i < chain.length - 1 ? ` → 다음 폴백 시도` : ` (체인 끝)`),
            err,
          );
        }
      }
      throw lastErr ?? new Error("모든 모델 실패");
    };

    /**
     * per-crop OCR — 검증된 문제 박스마다 1콜 (cropLimit 병렬), number 병합.
     * 박스 1개의 crop/OCR 실패는 격리(경고 후 skip) — 다른 문항 진행. 전부 실패면 throw.
     */
    const runPerCropOcr = async (
      page: WizardPage,
      rotated: string,
      problemBoxes: ReadonlyArray<ProblemBox>,
    ): Promise<{ items: OCRProblem[]; modelUsed: OCRModel } | null> => {
      const results = await Promise.all(
        problemBoxes.map((box) =>
          cropLimit(async (): Promise<{ item: OCRProblem; model: OCRModel } | null> => {
            if (isCancelled(page.id)) return null;
            // 박스 영역만 crop + 전처리 (작은 크롭이라 upscale 효과 큼).
            let crop: string;
            try {
              crop = await cropPageImageData(rotated, box.bbox, { margin: CROP_MARGIN });
              crop = await preprocessForOcr(crop);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(`[usePageOcr] ${page.id} box ${box.number} crop 실패 — skip`, err);
              return null;
            }
            if (isCancelled(page.id)) return null;
            // complexity 라우팅 — 복합/도형 크롭은 Pro, 단순은 Flash.
            const chain = box.complexity === "complex" ? pass2Chain : pass1Chain;
            let r: { items: OCRProblem[]; modelUsed: OCRModel } | null;
            try {
              r = await ocrChainOnImage(page, crop, chain, {
                crop: true,
                textLayer: "", // 박스 한정 — PDF text hint 없음
                label: `크롭(${box.number})`,
              });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn(
                `[usePageOcr] ${page.id} box ${box.number} OCR 전 체인 실패 — skip`,
                err,
              );
              return null;
            }
            if (!r) return null;
            // 크롭 = 1 문제. number 매칭 우선. 매칭 실패 + 다중 item 이면 옆 문제
            // 흡수 가능성 → items[0] 채택하되 status="warn" 으로 사용자 검토 유도.
            const byNumber = r.items.find((it) => it.number === box.number);
            const matched = byNumber ?? r.items[0];
            if (!matched) return null;
            const ambiguous = !byNumber && r.items.length > 1;
            if (ambiguous) {
              // eslint-disable-next-line no-console
              console.warn(
                `[usePageOcr] ${page.id} box ${box.number}: number 매칭 실패 + 다중 item → items[0] 채택(검토 필요)`,
              );
            }
            // 크롭-로컬 box → full-page 역변환 (box.bbox 기준 + 동일 margin).
            const remap = (b: [number, number, number, number]) =>
              remapBoxToFullPage(b, box.bbox, CROP_MARGIN);
            const item: OCRProblem = {
              ...matched,
              number: box.number, // 검출 번호 강제 (모델이 박스 안 번호 오독 정정 — number boost)
              ocrModel: r.modelUsed,
              status: ambiguous ? "warn" : matched.status,
              images: matched.images?.map((im) => {
                // box 가 remap 으로 바뀌므로 옛 ai-crop freeze path 무효 → strip.
                const { storagePath: _drop, ...rest } = im;
                void _drop;
                return { ...rest, box: remap(im.box) };
              }),
              figures: matched.figures?.map((f) => ({ ...f, box: remap(f.box) })),
            };
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.debug(`[usePageOcr] ${page.id} crop box ${box.number} ✓ ${r.modelUsed}`);
            }
            return { item, model: r.modelUsed };
          }),
        ),
      );
      if (isCancelled(page.id)) return null;

      // 박스 ↔ 결과 정렬. 실패 박스는 placeholder(검토 필요) 카드로 surface — silent
      // drop 방지 (검증된 박스인데 OCR 실패 시 그 문항이 통째로 사라지는 회귀 차단).
      const okItems: OCRProblem[] = [];
      const failedNumbers: number[] = [];
      let lastModel: OCRModel | null = null;
      results.forEach((r, i) => {
        if (r) {
          okItems.push(r.item);
          lastModel = r.model;
        } else {
          failedNumbers.push(problemBoxes[i].number);
        }
      });
      if (okItems.length === 0) {
        throw new Error("모든 문항 크롭 OCR 실패 — 페이지 재인식하거나 박스를 확인하세요.");
      }
      for (const num of failedNumbers) {
        okItems.push({
          id: crypto.randomUUID(),
          number: num,
          text: "(이 문항 OCR 실패 — '페이지 재인식' 으로 다시 시도하거나 직접 입력하세요.)",
          status: "warn",
          reviewed: false,
          bodyMissing: true,
        });
        // eslint-disable-next-line no-console
        console.warn(`[usePageOcr] ${page.id} box ${num}: OCR 실패 — placeholder 카드 생성`);
      }

      // 중복 번호 dedup (keep-first) — cropDetect 오번호/박스 중복 시 number-keyed
      // reconcile·정답지 정렬 깨짐 방지.
      const seen = new Set<number>();
      const deduped = okItems.filter((it) => {
        if (seen.has(it.number)) {
          // eslint-disable-next-line no-console
          console.warn(`[usePageOcr] ${page.id}: 중복 번호 ${it.number} item drop`);
          return false;
        }
        seen.add(it.number);
        return true;
      });
      // number 오름차순 정렬 (박스 순서 흔들림 방지). 마지막 성공 모델을 페이지 대표로.
      const items = deduped.sort((a, b) => a.number - b.number);
      return { items, modelUsed: lastModel ?? pass1Chain[0] };
    };

    pages.forEach((page) => {
      if (page.ocrComplete || page.ocrError || dispatched.current.has(page.id)) return;
      // 비-문항 페이지 — 빈 결과로 즉시 완료.
      if (!page.isProblemPage && !page.forceOcr) {
        dispatched.current.add(page.id);
        setPageOCR(page.id, { ocrResult: [], ocrComplete: true });
        return;
      }
      dispatched.current.add(page.id);
      const startedAt = Date.now();
      void pageLimit(async () => {
        // 페이지 spinner — in-flight 표시 (per-crop 은 박스별 모델이 섞이므로 대표 모델만).
        setPageOCR(page.id, { ocrInflightModel: pass1Chain[0], ocrStartedAt: startedAt });
        try {
          const rotated = await loadRotatedImage(page);
          if (!rotated) return;

          const problemBoxes = (page.cropBoxes ?? []).filter(
            (b): b is ProblemBox => b.class === "problem" && typeof b.number === "number",
          );

          let result: { items: OCRProblem[]; modelUsed: OCRModel } | null;
          if (problemBoxes.length === 0) {
            // ── fallback: 크롭 없음 → whole-page OCR (legacy / 검출 실패 안전망) ──
            const preprocessed = await preprocessForOcr(rotated);
            if (isCancelled(page.id)) return;
            result = await ocrChainOnImage(page, preprocessed, pass1Chain, {
              crop: false,
              textLayer: page.textLayer,
              label: "전체",
            });
          } else {
            // ── per-crop OCR (testchange 방향) ──
            result = await runPerCropOcr(page, rotated, problemBoxes);
          }
          if (!result) return;

          // 크롭 분류(kind="essay") 권위 신호로 "보기 누락" 오경고 제거 (§18, 2026-06-02).
          const reconciled = reconcileChoicesMissingWithCrop(result.items, page.cropBoxes);
          setPageOCR(page.id, {
            ocrResult: reconciled,
            ocrComplete: true,
            ocrModel: result.modelUsed as WizardPage["ocrModel"],
            ocrInflightModel: undefined,
            ocrStartedAt: undefined,
          });
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug(
              `[usePageOcr] ${page.id} OCR 완료 ` +
                `(${problemBoxes.length === 0 ? "whole-page" : `per-crop ${problemBoxes.length}박스`}) ` +
                `${result.modelUsed} — ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${result.items.length} 문항)`,
            );
          }
        } catch (err) {
          if (isCancelled(page.id)) return;
          // eslint-disable-next-line no-console
          console.error(`[usePageOcr] 페이지 ${page.id} OCR 실패`, err);
          setPageOCR(page.id, {
            ocrError: (() => {
              reportError(err, { kind: "ocr", extra: { hook: "usePageOcr", pageId: page.id } });
              return friendlyError(err);
            })(),
            ocrComplete: true,
            ocrInflightModel: undefined,
            ocrStartedAt: undefined,
          });
        } finally {
          // in-flight 슬롯 해제 — 미래 store 변경(재인식 ocrComplete:false / 새 업로드)이
          // 수동 resetDispatch 없이 재dispatch 가능하게.
          dispatched.current.delete(page.id);
        }
      });
    });

    // NOTE: no abort here (§1-6-b). 이 effect 재실행(우리 setPageOCR 로 pages 변경)이
    // in-flight 워커를 죽이면 안 됨. 워커는 dispatched.current 멤버십으로 self-cancel;
    // 실제 취소는 resetDispatch(page.id) 경유.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  /**
   * 페이지의 dispatched 마커를 비워 다음 effect cycle 이 재 pick. 없으면 "페이지 재인식"/
   * 회전 reset 이 ocrComplete:false 를 세팅해도 dispatched Set 에 id 가 남아 영영 skip.
   * Callers: Step2OCRReview 의 requestRetry / forcePageOcr.
   */
  const resetDispatch = (pageId: string): void => {
    dispatched.current.delete(pageId);
  };

  return { resetDispatch };
};
