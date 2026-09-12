import { useEffect, useMemo, useRef, useState } from "react";
import { pLimit, withRetry } from "@app/lib/concurrency";
import { getPageImage } from "@app/lib/imageStore";
import { ensurePageImage } from "@app/lib/imageRestore";
import { applyRotation, cropPageImageData } from "@app/lib/pdfProcessor";
import { remapBoxToFullPage } from "@app/lib/figureBoxRemap";
import { figureDetectionReady, intersectFigureBox, QUESTION_CROP_MARGIN } from "@app/lib/figureCrops";
import { detectQuestionFigures } from "@app/services/ai/figurePipeline";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { useWizardStore, type WizardPage } from "@app/stores/wizardStore";

/** 첫 검수 화면에서 문제 크롭 → 내부 그림 검출. 재작도는 다음 단계에서만 한다. */
export function useFigureCropDetect() {
  const pages = useWizardStore(s => s.pages);
  const limit = useMemo(() => pLimit(2), []);
  const dispatched = useRef(new Set<string>());
  const images = useRef(new Map<string, Promise<string>>());
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    const imageKey = (page: WizardPage) => `${page.id}:${page.imageRef}:${page.rotation}`;
    const currentImages = new Set(pages.map(imageKey));
    for (const key of images.current.keys()) if (!currentImages.has(key)) images.current.delete(key);
    const loadImage = (page: WizardPage) => {
      const key = imageKey(page);
      let pending = images.current.get(key);
      if (!pending) {
        pending = (async () => {
          const image = await getPageImage(page.imageRef)
            ?? await ensurePageImage(page, getPageStoragePath(page.id));
          if (!image) throw new Error("페이지 이미지를 불러올 수 없습니다.");
          return applyRotation(image.dataUrl, page.rotation);
        })();
        images.current.set(key, pending);
        void pending.catch(() => images.current.delete(key));
      }
      return pending;
    };

    for (const page of pages) {
      for (const box of page.cropBoxes ?? []) {
        if (figureDetectionReady(box)) continue;
        const key = `${page.id}:${box.id}`;
        if (dispatched.current.has(key)) continue;
        dispatched.current.add(key);
        const isCurrent = () => {
          if (!dispatched.current.has(key)) return false;
          const latestPage = useWizardStore.getState().pages.find(p => p.id === page.id);
          const latest = latestPage?.cropBoxes?.find(b => b.id === box.id);
          return latestPage?.rotation === page.rotation && latestPage.imageRef === page.imageRef
            && !!latest && !figureDetectionReady(latest) && latest.bbox.every((n, i) => n === box.bbox[i]);
        };
        void limit(async () => {
          try {
            if (!isCurrent()) return;
            const rotated = await loadImage(page);
            if (!isCurrent()) return;
            const questionCrop = await cropPageImageData(rotated, box.bbox, { margin: QUESTION_CROP_MARGIN });
            if (!isCurrent()) return;
            const figures = await withRetry(() => {
              if (!isCurrent()) throw new DOMException("Cancelled", "AbortError");
              return detectQuestionFigures(questionCrop);
            }, { maxRetries: 2 });
            if (!isCurrent()) return;
            const figureCrops = figures.flatMap(figure => {
              const bbox = intersectFigureBox(remapBoxToFullPage(figure.box, box.bbox, QUESTION_CROP_MARGIN), box.bbox);
              return bbox ? [{ id: crypto.randomUUID(), bbox, kind: figure.kind, label: figure.label, source: "ai" as const }] : [];
            });
            useWizardStore.getState().updateCropBox(page.id, box.id, { figureCrops, figureDetectError: undefined });
          } catch (error) {
            if (isCurrent()) useWizardStore.getState().updateCropBox(page.id, box.id, {
              figureDetectError: (error as Error).message,
            });
          } finally {
            dispatched.current.delete(key);
            // 박스 편집으로 오래된 응답이 버려져도 최신 좌표를 다시 검출한다.
            setCompleted(n => n + 1);
          }
        });
      }
    }
    // StrictMode/HMR cleanup에서 HTTP를 취소하지 않는다 (§1-6-b).
  }, [pages, limit, completed]);
}
