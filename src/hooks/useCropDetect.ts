// useCropDetect.ts
//
// Phase I-2 — Step 1.5 (검수) 의 cropDetect fan-out 훅.
//
// 마운트되면 wizardStore.pages 의 각 페이지에 대해:
//   1. 이미 검출됐으면 (cropBoxes !== undefined) skip
//   2. 에러 상태면 (cropDetectError) skip (사용자 resetDispatch 대기)
//   3. 비-문항 페이지 (isProblemPage=false && forceOcr=false) 면 빈 배열로 즉시
//      통과 — Step 1.5 에서 검토 unnecessary
//   4. 이미 dispatched 면 skip (StrictMode/HMR 안전)
//   5. cropDetect 호출 → DetectedCrop[] → CropBox[] 매핑 → setPageCropBoxes
//
// **패턴** (CLAUDE.md §1-6 / §16-4): usePageOcr 와 동일 — `dispatched` Set
// 멤버십만 cancel 신호. AbortController 사용 금지 (React 19 StrictMode + HMR
// + unmount 재진입 → 무한 dispatch 루프 회피).
//
// **재시도 흐름**: 사용자가 Step 1.5 에서 "재시도" 클릭 → useCropDetect 의
// resetDispatch(pageId) → dispatched.delete + setCropDetectError(undefined).
// 다음 effect cycle 이 자연스럽게 재 pick.

import { useEffect, useMemo, useRef } from "react";

import { pLimit } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { ensurePageImage } from "@app/lib/imageRestore";
import { getPageImage } from "@app/lib/imageStore";
import { applyRotation } from "@app/lib/pdfProcessor";
import {
  detectCropBoxes,
  refineCropBoxesWithGpt55,
  type DetectedCrop,
} from "@app/services/ai/cropDetect";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { useWizardStore } from "@app/stores/wizardStore";
import type { CropBox } from "@app/stores/wizardStore";

/**
 * cropDetect 의 `DetectedCrop` (모델 출력) 을 wizardStore 의 `CropBox` 로 매핑.
 * - id: crypto.randomUUID() — React stable key + 사용자 편집 추적용
 * - class: 모델 출력 (problem|figure|table|artwork). 옛 응답 호환 — 누락이면
 *   "problem" default. 사용자가 Step 1.5 에서 수동 변경 가능.
 * - bbox: 4-tuple 보장 — cropDetect 의 `cropBox: number[]` 가 길이 4 미만이면
 *   기본값 (0/1000) 로 안전 fallback.
 * - source: "ai" — 사용자 편집 시 store 의 updateCropBox 가 자동 "edited" 로 변경.
 * - number: 인쇄된 문항 번호 — Pass 2 결과 merge 시 key.
 */
const ALLOWED_CLASSES: ReadonlyArray<CropBox["class"]> = [
  "problem",
  "figure",
  "table",
  "artwork",
];

const detectedToCropBox = (d: DetectedCrop): CropBox => {
  const [yMin = 0, xMin = 0, yMax = 1000, xMax = 1000] = d.cropBox;
  // 모델이 누락하거나 enum 외 값을 emit 한 경우 "problem" default.
  const cls: CropBox["class"] =
    d.class && ALLOWED_CLASSES.includes(d.class) ? d.class : "problem";
  return {
    id: crypto.randomUUID(),
    class: cls,
    // cropDetect 의 type ("choice"|"essay") 을 kind 로 보존 → EditableCropBox
    // 라벨에 "객관"/"서술" prefix 로 표시. 사용자 요청 (2026-05-26).
    kind: d.type,
    bbox: [yMin, xMin, yMax, xMax],
    verified: false,
    source: "ai",
    number: d.number,
  };
};

export interface UseCropDetect {
  /** 사용자 재시도 — 이 페이지의 in-flight 마커 + 에러 모두 비움. */
  resetDispatch: (pageId: string) => void;
}

export const useCropDetect = (): UseCropDetect => {
  const pages = useWizardStore((s) => s.pages);
  const setPageCropBoxes = useWizardStore((s) => s.setPageCropBoxes);
  const setCropDetectInflight = useWizardStore((s) => s.setCropDetectInflight);
  const setCropDetectError = useWizardStore((s) => s.setCropDetectError);

  // pLimit(2) — Gemini 3 Flash 호출 ~2-3s/page. 동시 2 안전.
  const limit = useMemo(() => pLimit(2), []);
  const dispatched = useRef<Set<string>>(new Set());

  useEffect(() => {
    const isCancelled = (id: string) => !dispatched.current.has(id);

    // *비-문항 페이지 일괄 처리* — 한 번의 store mutation 으로 모두 빈 배열 set.
    // 개별 setPageCropBoxes(p.id, []) N 회 호출은 매 setState 마다 pages
    // reference 변경 → effect 재실행 → React maximum update depth 에러.
    // 한 번의 functional setState 로 N 페이지 update 하면 1 회만 trigger.
    const needsBatchEmpty = pages.some(
      (p) => p.cropBoxes === undefined && !p.isProblemPage && !p.forceOcr,
    );
    if (needsBatchEmpty) {
      useWizardStore.setState((state) => ({
        pages: state.pages.map((p) =>
          p.cropBoxes === undefined && !p.isProblemPage && !p.forceOcr
            ? { ...p, cropBoxes: [] }
            : p,
        ),
      }));
      return; // 다음 effect cycle 에서 자연스럽게 문제 페이지 처리
    }

    for (const page of pages) {
      // (1) 이미 검출됨
      if (page.cropBoxes !== undefined) continue;
      // (2) 에러 상태 — 사용자 resetDispatch 까지 대기
      if (page.cropDetectError) continue;
      // (3) 이미 dispatch 중
      if (dispatched.current.has(page.id)) continue;

      dispatched.current.add(page.id);
      setCropDetectInflight(page.id, true);

      void limit(async () => {
        try {
          // 1. IndexedDB 의 페이지 이미지 우선
          let dataUrl: string | null = null;
          const existing = await getPageImage(page.imageRef);
          if (isCancelled(page.id)) return;
          if (existing) {
            dataUrl = existing.dataUrl;
          } else {
            // 2. Supabase Storage fallback (page-images bucket)
            const storagePath = getPageStoragePath(page.id);
            const restored = await ensurePageImage(page, storagePath);
            if (isCancelled(page.id)) return;
            dataUrl = restored?.dataUrl ?? null;
          }
          if (!dataUrl) {
            throw new Error("페이지 이미지를 불러올 수 없습니다.");
          }

          // 3. 회전 적용 (OCR 와 동일 패턴)
          const rotated = await applyRotation(dataUrl, page.rotation);
          if (isCancelled(page.id)) return;

          // 4. Gemini 3 Flash 호출 (1차 — 빠른 분석)
          const detected = await detectCropBoxes(rotated);
          if (isCancelled(page.id)) return;

          // 5. complex 문항 있으면 GPT-5.5 정밀 재검출 (best-effort enhancement)
          //    - complexity = "complex" → 다중 시각 요소 또는 긴 서술형 (200자+)
          //    - GPT-5.5 실패 / 빈 응답 → Gemini 결과 유지 (silent fallback)
          //    - 사용자 결정 (2026-05-27): 자동 트리거 + 개별 교체
          const hasComplex = detected.some((d) => d.complexity === "complex");
          let finalDetected: DetectedCrop[] = detected;
          if (hasComplex) {
            if (import.meta.env?.DEV) {
              const complexNums = detected
                .filter((d) => d.complexity === "complex")
                .map((d) => d.number);
              console.debug(
                `[useCropDetect] page ${page.id} complex 문항 [${complexNums.join(",")}] — GPT-5.5 정밀 재검출`,
              );
            }
            // refine(GPT-5.5) 은 best-effort enhancement — 실패해도 Gemini 결과
            // 그대로 사용. 별도 try/catch 로 격리: 옛 구조는 detect+refine 이 한
            // try 라 prod 에서 refine 이 throw(OpenAI 키 없음 등)하면 *성공한
            // Gemini 결과까지 버려져* 페이지 전체 검출 실패했음 (사용자 보고
            // 2026-06-04). AbortError 만 재throw (사용자 취소 존중).
            try {
              finalDetected = await refineCropBoxesWithGpt55(rotated, detected);
              if (isCancelled(page.id)) return;
            } catch (refineErr) {
              if ((refineErr as Error).name === "AbortError") throw refineErr;
              finalDetected = detected;
              if (import.meta.env?.DEV) {
                console.debug(
                  `[useCropDetect] page ${page.id} refine 실패 — Gemini 결과 사용:`,
                  (refineErr as Error).message,
                );
              }
            }
          }

          // 6. 매핑 + store update (1 회 호출 — refined 결과로)
          const boxes: CropBox[] = finalDetected.map(detectedToCropBox);
          setPageCropBoxes(page.id, boxes);
        } catch (err) {
          if (isCancelled(page.id)) return;
          setCropDetectError(page.id, friendlyError(err));
          // friendly 는 "처리 실패" 로 뭉개질 수 있으니 *raw cause* 도 함께 로깅.
          // cropDetect 가 .cause 에 원본 에러를 보존 (이중 friendly 래핑 함정).
          // prod 도 짧게 surfacing — 사용자 보고 시 추적 가능 (CLAUDE.md §30-3).
          const cause = (err as Error & { cause?: unknown }).cause;
          console.warn(
            `[useCropDetect] page ${page.id} failed: ${(err as Error).message}` +
              (cause ? `\n  raw cause: ${String(cause).slice(0, 400)}` : ""),
          );
        } finally {
          setCropDetectInflight(page.id, false);
          dispatched.current.delete(page.id);
        }
      });
    }
  }, [
    pages,
    limit,
    setPageCropBoxes,
    setCropDetectInflight,
    setCropDetectError,
  ]);

  return {
    resetDispatch: (pageId: string) => {
      dispatched.current.delete(pageId);
      setCropDetectError(pageId, undefined);
    },
  };
};
