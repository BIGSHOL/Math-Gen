// Step1_5CropInspect.tsx (Phase I-3)
//
// Step 1.5 — 업로드 직후 *문항 크롭 박스 검수* 화면.
//
// 흐름:
//   1. useCropDetect() 마운트 → Gemini 3 Flash 가 페이지마다 박스 검출 (I-2)
//   2. 좌측 PageThumbColumn — 페이지 전환
//   3. 중앙 — 활성 페이지 이미지 + 박스 overlay (EditableCropBox)
//      - create 모드 + 빈 영역 drag → 새 박스 추가 (addCropBox)
//   4. 우측 — CropEditTools + 박스 listing + 검토 완료 버튼
//      - markCropInspected (현재 페이지) / markAllCropInspected (일괄)
//
// 다음 단계 (Step 2 OCR Review) 는 cropInspected + cropBoxes.length > 0 인
// 페이지에 대해서만 Pass 2 (cropped GPT-5.5 재OCR) 트리거. (Phase I-7 의 변경)

import { useEffect, useMemo, useRef, useState } from "react";

import { Btn, Card, Eyebrow, Icon } from "@app/components/ui";
import { applyRotation } from "@app/lib/pdfProcessor";
import { ensurePageImage } from "@app/lib/imageRestore";
import { getPageImage } from "@app/lib/imageStore";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import { useWizardStore } from "@app/stores/wizardStore";
import type { CropBox, WizardPage } from "@app/stores/wizardStore";

import { CropEditTools, type CropTool } from "./CropEditTools";
import { EditableCropBox } from "./EditableCropBox";
import PageThumbColumn from "./PageThumbColumn";
import { useCropDetect } from "@app/hooks/useCropDetect";

/** active 페이지의 회전 적용된 dataUrl 을 비동기로 로드. */
const usePageImageDataUrl = (page: WizardPage | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!page) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let dataUrl: string | null = null;
        const existing = await getPageImage(page.imageRef);
        if (existing) {
          dataUrl = existing.dataUrl;
        } else {
          const storagePath = getPageStoragePath(page.id);
          const restored = await ensurePageImage(page, storagePath);
          dataUrl = restored?.dataUrl ?? null;
        }
        if (!dataUrl) {
          if (!cancelled) setUrl(null);
          return;
        }
        const rotated = await applyRotation(dataUrl, page.rotation);
        if (!cancelled) setUrl(rotated);
      } catch (err) {
        if (!cancelled) setUrl(null);
        if (import.meta.env?.DEV) {
          console.warn("[Step1_5CropInspect] image load:", (err as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page]);
  return url;
};

/** 페이지 이미지 영역에서 *빈 곳* drag → 새 박스 생성 (create 모드 전용). */
interface DrawHandlerProps {
  pageId: string;
  pageWidth: number;
  pageHeight: number;
  enabled: boolean;
  addCropBox: (pageId: string, box: Omit<CropBox, "id">) => void;
}

const useDrawNewBox = ({
  pageId,
  pageWidth,
  pageHeight,
  enabled,
  addCropBox,
}: DrawHandlerProps) => {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    rect: DOMRect | null;
  } | null>(null);
  const [preview, setPreview] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (e.target !== e.currentTarget) return; // 박스 자체 클릭은 통과
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, rect };
    setPreview({
      top: e.clientY - rect.top,
      left: e.clientX - rect.left,
      width: 0,
      height: 0,
    });
  };

  useEffect(() => {
    if (!preview) return;
    const handleMove = (e: PointerEvent) => {
      const origin = dragRef.current;
      if (!origin || !origin.rect) return;
      const rect = origin.rect;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const startX = origin.startX - rect.left;
      const startY = origin.startY - rect.top;
      setPreview({
        top: Math.min(startY, y),
        left: Math.min(startX, x),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      });
    };
    const handleUp = (e: PointerEvent) => {
      const origin = dragRef.current;
      if (!origin || !origin.rect) {
        setPreview(null);
        return;
      }
      const rect = origin.rect;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const startX = origin.startX - rect.left;
      const startY = origin.startY - rect.top;
      const top = Math.min(startY, y);
      const left = Math.min(startX, x);
      const width = Math.abs(x - startX);
      const height = Math.abs(y - startY);
      dragRef.current = null;
      setPreview(null);
      // 너무 작은 박스는 무시 (실수 클릭 방지) — width/height ≥ 30px
      if (width < 30 || height < 30) return;
      // 화면 px → 0-1000 정규화
      const yMin = Math.round((top / pageHeight) * 1000);
      const xMin = Math.round((left / pageWidth) * 1000);
      const yMax = Math.round(((top + height) / pageHeight) * 1000);
      const xMax = Math.round(((left + width) / pageWidth) * 1000);
      addCropBox(pageId, {
        class: "problem",
        bbox: [yMin, xMin, yMax, xMax],
        verified: false,
        source: "user",
      });
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [preview, pageId, pageWidth, pageHeight, addCropBox]);

  return { onPointerDown, preview };
};

export const Step1_5CropInspect = () => {
  const pages = useWizardStore((s) => s.pages);
  const activeIndex = useWizardStore((s) => s.activePageIndex);
  const addCropBox = useWizardStore((s) => s.addCropBox);
  const updateCropBox = useWizardStore((s) => s.updateCropBox);
  const deleteCropBox = useWizardStore((s) => s.deleteCropBox);
  const markCropInspected = useWizardStore((s) => s.markCropInspected);
  const markAllCropInspected = useWizardStore((s) => s.markAllCropInspected);

  useCropDetect(); // mount → 자동 검출 시작

  const [tool, setTool] = useState<CropTool>("select");
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  const activePage = pages[activeIndex];
  const pageImageUrl = usePageImageDataUrl(activePage);

  // 이미지 컨테이너 ref + 실제 px 크기 — bbox 변환 기준.
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!imageContainerRef.current) return;
    const el = imageContainerRef.current;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [pageImageUrl]);

  // create 모드 drag handler
  const { onPointerDown: onPageImageDown, preview } = useDrawNewBox({
    pageId: activePage?.id ?? "",
    pageWidth: containerSize.width,
    pageHeight: containerSize.height,
    enabled: tool === "create" && Boolean(activePage),
    addCropBox,
  });

  // 통계 — 전체 페이지 진행 상태.
  const totalPages = pages.length;
  const inspectedCount = useMemo(
    () => pages.filter((p) => p.cropInspected).length,
    [pages],
  );
  const detectingCount = useMemo(
    () => pages.filter((p) => p.cropDetectInflight).length,
    [pages],
  );

  if (!activePage) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-small">
        업로드된 페이지가 없습니다.
      </div>
    );
  }

  const boxes = activePage.cropBoxes ?? [];

  return (
    <div className="flex h-full gap-4">
      {/* 좌측 — 페이지 thumbnail */}
      <PageThumbColumn
        pages={pages}
        activeIndex={activeIndex}
        onSelect={(i) => useWizardStore.setState({ activePageIndex: i })}
      />

      {/* 중앙 — 페이지 이미지 + 박스 overlay */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <Eyebrow>페이지 {activeIndex + 1} 검수</Eyebrow>
          <span className="text-caption text-muted">
            {activePage.cropDetectInflight && "검출 중..."}
            {activePage.cropDetectError && (
              <span className="text-danger">{activePage.cropDetectError}</span>
            )}
            {activePage.cropBoxes && !activePage.cropDetectError && (
              <span>박스 {boxes.length}개</span>
            )}
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-surface2 rounded-r2 p-3">
          {pageImageUrl ? (
            <div
              ref={imageContainerRef}
              onPointerDown={onPageImageDown}
              onClick={() => setSelectedBoxId(null)}
              style={{
                position: "relative",
                display: "inline-block",
                cursor: tool === "create" ? "crosshair" : "default",
              }}
            >
              <img
                src={pageImageUrl}
                alt={`페이지 ${activeIndex + 1}`}
                style={{ display: "block", maxWidth: "100%", userSelect: "none" }}
                draggable={false}
              />
              {/* 박스 overlay */}
              {containerSize.width > 0 &&
                boxes.map((box) => (
                  <EditableCropBox
                    key={box.id}
                    box={box}
                    pageWidth={containerSize.width}
                    pageHeight={containerSize.height}
                    currentTool={tool}
                    selected={selectedBoxId === box.id}
                    onSelect={setSelectedBoxId}
                    onUpdate={(id, patch) => updateCropBox(activePage.id, id, patch)}
                    onDelete={(id) => {
                      deleteCropBox(activePage.id, id);
                      if (selectedBoxId === id) setSelectedBoxId(null);
                    }}
                  />
                ))}
              {/* 신규 박스 drag 프리뷰 */}
              {preview && (
                <div
                  style={{
                    position: "absolute",
                    top: preview.top,
                    left: preview.left,
                    width: preview.width,
                    height: preview.height,
                    border: "2px dashed #0EA5E9",
                    background: "rgba(14,165,233,0.1)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted text-small">
              <Icon name="image" size={20} weight="duotone" />
              <span className="ml-2">이미지 로드 중...</span>
            </div>
          )}
        </div>
      </div>

      {/* 우측 — 도구 + 진행 상태 + 다음 단계 */}
      <aside className="w-[240px] flex-shrink-0 flex flex-col gap-3 pl-3 border-l border-line">
        <Eyebrow>편집 도구</Eyebrow>
        <CropEditTools currentTool={tool} onChangeTool={setTool} boxCount={boxes.length} />

        <Card pad={12} className="bg-surface2">
          <Eyebrow className="mb-2">진행 상태</Eyebrow>
          <div className="space-y-1.5 text-small">
            <div className="flex justify-between">
              <span className="text-muted">전체 페이지</span>
              <span className="font-mono">{totalPages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">검출 중</span>
              <span className={`font-mono ${detectingCount > 0 ? "text-accent" : ""}`}>
                {detectingCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">검토 완료</span>
              <span className="font-mono">
                {inspectedCount} / {totalPages}
              </span>
            </div>
          </div>
        </Card>

        <Btn
          kind="secondary"
          icon="check"
          full
          onClick={() => markCropInspected(activePage.id)}
          disabled={activePage.cropInspected}
        >
          {activePage.cropInspected ? "검토 완료됨" : "이 페이지 검토 완료"}
        </Btn>
        <Btn
          kind="ghost"
          icon="check-square"
          full
          size="sm"
          onClick={() => markAllCropInspected()}
        >
          모든 페이지 일괄 완료
        </Btn>
      </aside>
    </div>
  );
};

export default Step1_5CropInspect;
