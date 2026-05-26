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
import { detectCropBoxes, type DetectedCrop } from "@app/services/ai/cropDetect";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { useWizardStore } from "@app/stores/wizardStore";
import type { CropBox } from "@app/stores/wizardStore";

/**
 * cropDetect 의 `DetectedCrop` (모델 출력) 을 wizardStore 의 `CropBox` 로 매핑.
 * - id: crypto.randomUUID() — React stable key + 사용자 편집 추적용
 * - class: "problem" 고정 — cropDetect 는 figure/table 미식별. 사용자가 Step
 *   1.5 에서 수동으로 class 변경 가능 (figure/table).
 * - bbox: 4-tuple 보장 — cropDetect 의 `cropBox: number[]` 가 길이 4 미만이면
 *   기본값 (0/1000) 로 안전 fallback.
 * - source: "ai" — 사용자 편집 시 store 의 updateCropBox 가 자동 "edited" 로 변경.
 * - number: 인쇄된 문항 번호 — Pass 2 결과 merge 시 key.
 */
const detectedToCropBox = (d: DetectedCrop): CropBox => {
  const [yMin = 0, xMin = 0, yMax = 1000, xMax = 1000] = d.cropBox;
  return {
    id: crypto.randomUUID(),
    class: "problem",
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

    for (const page of pages) {
      // (1) 이미 검출됨
      if (page.cropBoxes !== undefined) continue;
      // (2) 에러 상태 — 사용자 resetDispatch 까지 대기
      if (page.cropDetectError) continue;
      // (3) 비-문항 페이지 → 빈 배열 즉시 통과 (검토 unnecessary)
      if (!page.isProblemPage && !page.forceOcr) {
        setPageCropBoxes(page.id, []);
        continue;
      }
      // (4) 이미 dispatch 중
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

          // 4. Gemini 3 Flash 호출
          const detected = await detectCropBoxes(rotated);
          if (isCancelled(page.id)) return;

          // 5. 매핑 + store update
          const boxes: CropBox[] = detected.map(detectedToCropBox);
          setPageCropBoxes(page.id, boxes);
        } catch (err) {
          if (isCancelled(page.id)) return;
          setCropDetectError(page.id, friendlyError(err));
          if (import.meta.env?.DEV) {
            console.warn(
              `[useCropDetect] page ${page.id}:`,
              (err as Error).message,
            );
          }
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
