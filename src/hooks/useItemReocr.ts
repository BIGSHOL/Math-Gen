import { useCallback, useState } from "react";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation, cropPageImageData } from "@app/lib/pdfProcessor";
import { remapBoxToFullPage } from "@app/lib/figureBoxRemap";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { withRetry } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { showToast } from "@app/stores/toastStore";
import { extractPageProblems, type OCRModel } from "@app/services/ai/ocr";
import { GEMINI_3_5_FLASH, isGeminiAvailable } from "@app/services/ai/gemini";
import { SONNET_MODEL } from "@app/services/ai/client";
import { useWizardStore, type OCRProblem, type WizardPage } from "@app/stores/wizardStore";

/**
 * 문항별 재인식 — 한 문항의 *크롭 박스만* 다시 OCR 해 그 항목만 교체한다.
 *
 * 페이지 전체 재인식(usePageOcr 의 "페이지 재인식")과 달리, 다른 *확정·편집한* 문항은
 * 그대로 보존하고 선택한 한 문항만 갱신한다(usePageOcr Pass 2 의 크롭 OCR 패턴 재사용).
 *
 * **전제**: 그 문항의 cropBox(Step 1.5 에서 검출/검수)가 있어야 한다. 없으면(legacy 세션)
 * 페이지 재인식을 쓰라는 toast 안내.
 *
 * **취소/병렬**: 항목 단위라 fan-out 아님 — 단순 inflight Set 으로 중복 클릭/스피너만 관리.
 * `setPageOCR` 는 page id 없으면 no-op 이라 unmount 후 완료돼도 안전.
 */

/** usePageOcr 와 *동일* 해야 box 역변환이 정확. */
const CROP_MARGIN = 0.02;

export const useItemReocr = () => {
  const setPageOCR = useWizardStore((s) => s.setPageOCR);
  // 재인식 중인 항목 키("pageId:number") — UI 스피너용.
  const [inflight, setInflight] = useState<ReadonlySet<string>>(() => new Set());

  const reocrItem = useCallback(
    async (page: WizardPage, item: OCRProblem): Promise<void> => {
      const key = `${page.id}:${item.number}`;
      if (inflight.has(key)) return; // 중복 클릭 무시

      const box = (page.cropBoxes ?? []).find(
        (b) => b.class === "problem" && b.number === item.number,
      );
      if (!box) {
        showToast({
          kind: "warn",
          message: "이 페이지는 문항 크롭 정보가 없어 '페이지 재인식'을 사용하세요.",
        });
        return;
      }

      setInflight((s) => new Set(s).add(key));
      try {
        // 1. 페이지 이미지 로드(IndexedDB → Storage fallback) + 회전.
        let dataUrl: string;
        if (!page.imageRef) {
          const restored = await ensurePageImage(page, getPageStoragePath(page.id));
          if (!restored) throw new Error("페이지 이미지를 찾을 수 없습니다.");
          dataUrl = restored.dataUrl;
        } else {
          const image = await getPageImage(page.imageRef);
          if (!image) throw new Error("페이지 이미지를 찾을 수 없습니다.");
          dataUrl = image.dataUrl;
        }
        const rotated =
          page.rotation === 0 ? dataUrl : await applyRotation(dataUrl, page.rotation);

        // 2. 그 문항 박스만 crop.
        const crop = await cropPageImageData(rotated, box.bbox, { margin: CROP_MARGIN });

        // 3. OCR (Gemini 3.5 Flash → Sonnet 폴백). 크롭 = 1 문제.
        const chain: OCRModel[] = isGeminiAvailable()
          ? [GEMINI_3_5_FLASH, SONNET_MODEL]
          : [SONNET_MODEL];
        let matched: OCRProblem | null = null;
        let modelUsed: OCRModel | null = null;
        let lastErr: Error | null = null;
        for (const model of chain) {
          try {
            const result = await withRetry(() =>
              extractPageProblems({ pageBase64: crop, textLayer: "", model, crop: true }),
            );
            matched = result.items.find((it) => it.number === item.number) ?? result.items[0] ?? null;
            modelUsed = model;
            break;
          } catch (err) {
            lastErr = err as Error;
          }
        }
        if (!matched || !modelUsed) throw lastErr ?? new Error("문항 OCR 에 실패했습니다.");

        // 4. crop-local box → full-page 역변환(usePageOcr Pass 2 와 동일).
        const remap = (b: [number, number, number, number]) =>
          remapBoxToFullPage(b, box.bbox, CROP_MARGIN);
        const newItem: OCRProblem = {
          ...matched,
          id: item.id, // React key·참조 보존
          number: item.number, // 검출 번호 강제(모델 오독 정정)
          reviewed: false, // 재인식했으니 재검토
          ocrModel: modelUsed,
          images: matched.images?.map((im) => {
            const { storagePath: _drop, ...rest } = im;
            void _drop;
            return { ...rest, box: remap(im.box) };
          }),
          figures: matched.figures?.map((f) => ({ ...f, box: remap(f.box) })),
        };

        // 5. 그 항목만 교체(최신 store 기준 — stale 방지).
        const fresh = useWizardStore.getState().pages.find((p) => p.id === page.id);
        const nextResult = (fresh?.ocrResult ?? []).map((it) =>
          it.id === item.id ? newItem : it,
        );
        setPageOCR(page.id, { ocrResult: nextResult });
        showToast({ kind: "success", message: `${item.number}번 문항을 다시 인식했습니다.` });
      } catch (err) {
        showToast({ kind: "error", message: `재인식 실패 — ${friendlyError(err)}` });
      } finally {
        setInflight((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
      }
    },
    [setPageOCR, inflight],
  );

  const isReocring = useCallback(
    (pageId: string, number: number): boolean => inflight.has(`${pageId}:${number}`),
    [inflight],
  );

  return { reocrItem, isReocring };
};
