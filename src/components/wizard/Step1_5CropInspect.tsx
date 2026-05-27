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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Btn, Card, Eyebrow, Icon } from "@app/components/ui";
import { useWizardStore } from "@app/stores/wizardStore";
import type { CropBox } from "@app/stores/wizardStore";

import { CropEditTools, type CropTool } from "./CropEditTools";
import { EditableCropBox } from "./EditableCropBox";
import PageThumbColumn from "./PageThumbColumn";
import { useCropDetect } from "@app/hooks/useCropDetect";
import { usePageImageDataUrl } from "@app/hooks/usePageImageDataUrl";
import { showToast } from "@app/stores/toastStore";

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

  // 이미지 zoom — "fit" (현재 viewport 폭 자동) 또는 0.25 ~ 2.0 (원본 픽셀 배율).
  // 사용자 보고 (2026-05-27): "화면이 너무 큰거같은데 비율을 작게 할 수 있는
  // 기능도 필요하겠어" — 페이지 이미지를 작게 보면서 박스 전체 한눈에 검수 가능.
  // 박스 % 좌표는 containerSize (ResizeObserver) 기반 자동 적응 → 추가 변환 X.
  type ImageScale = number | "fit";
  const [imageScale, setImageScale] = useState<ImageScale>("fit");
  const [naturalWidth, setNaturalWidth] = useState<number>(0);

  const zoomIn = useCallback(
    () =>
      setImageScale((s) => {
        if (s === "fit") return 1.0;
        return Math.min(2.0, Math.round((s + 0.1) * 100) / 100);
      }),
    [],
  );
  const zoomOut = useCallback(
    () =>
      setImageScale((s) => {
        if (s === "fit") return 0.5;
        return Math.max(0.25, Math.round((s - 0.1) * 100) / 100);
      }),
    [],
  );
  const zoomFit = useCallback(() => setImageScale("fit"), []);

  // 키보드 단축키: Ctrl/⌘ + +/-/0
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // textarea / input 안에서는 비활성 (네이티브 브라우저 zoom 우선)
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        zoomFit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIn, zoomOut, zoomFit]);

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

  // 통계 — 전체 페이지 진행 상태 + 총 검출 문항.
  const totalPages = pages.length;
  const inspectedCount = useMemo(
    () => pages.filter((p) => p.cropInspected).length,
    [pages],
  );
  const detectingCount = useMemo(
    () => pages.filter((p) => p.cropDetectInflight).length,
    [pages],
  );
  // 전체 페이지의 검출 박스 총합 — 사용자 요청 (2026-05-26): "검출 후의 총
  // 문제수도 나오면 좋겠네". 사용자가 시험지 전체 문항 수와 즉시 비교 가능.
  const totalDetectedBoxes = useMemo(
    () => pages.reduce((sum, p) => sum + (p.cropBoxes?.length ?? 0), 0),
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
          {/* 상태 라벨 — 사용자 보고 (2026-05-27): "검출 중" 이 너무 약해서 멈춘 것처럼 보임.
              검출 중일 때는 accent 색 + spinner + bouncing dots + pulse 로 강화. */}
          {activePage.cropDetectInflight ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-r2 bg-accent-soft text-accent border border-accent/30 text-small font-semibold animate-loud-pulse">
              <Icon name="circle-notch" size={13} className="animate-spin" />
              AI가 문항 검출 중
              <span className="inline-flex gap-0.5 ml-0.5">
                <span
                  className="w-1 h-1 rounded-full bg-accent animate-loud-pulse"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1 h-1 rounded-full bg-accent animate-loud-pulse"
                  style={{ animationDelay: "200ms" }}
                />
                <span
                  className="w-1 h-1 rounded-full bg-accent animate-loud-pulse"
                  style={{ animationDelay: "400ms" }}
                />
              </span>
            </span>
          ) : activePage.cropDetectError ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-r2 bg-warn-soft text-warnInk border border-warn/30 text-small font-medium">
              <Icon name="warning" size={13} weight="fill" />
              {activePage.cropDetectError}
            </span>
          ) : activePage.cropBoxes ? (
            <span className="inline-flex items-center gap-1 text-caption text-muted">
              <Icon name="check-circle" size={12} weight="fill" className="text-ok" />
              박스 {boxes.length}개 검출
            </span>
          ) : null}
        </div>
        <div className="flex-1 min-h-0 overflow-auto bg-surface2 rounded-r2 p-3 relative">
          {/* Zoom 컨트롤 — floating toolbar 상단 우측. 사용자 보고 (2026-05-27):
              "화면이 너무 큰거같은데 비율을 작게 할 수 있는 기능도 필요". */}
          {pageImageUrl && (
            <div
              className="absolute top-2 right-2 z-10 flex items-center gap-0.5 bg-surface/95 backdrop-blur rounded-r2 border border-line px-1 py-1 shadow-s1 text-text"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={zoomOut}
                title="축소 (Ctrl+−)"
                aria-label="축소"
                className="w-7 h-7 grid place-items-center rounded-r1 hover:bg-hover transition-colors"
              >
                <Icon name="minus" size={13} />
              </button>
              <button
                type="button"
                onClick={zoomFit}
                title="화면에 맞춤 (Ctrl+0)"
                className="px-1.5 h-7 min-w-[3.2em] grid place-items-center rounded-r1 hover:bg-hover transition-colors font-mono text-caption font-semibold"
              >
                {imageScale === "fit" ? "맞춤" : `${Math.round(imageScale * 100)}%`}
              </button>
              <button
                type="button"
                onClick={zoomIn}
                title="확대 (Ctrl++)"
                aria-label="확대"
                className="w-7 h-7 grid place-items-center rounded-r1 hover:bg-hover transition-colors"
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
          )}
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
                onLoad={(e) => setNaturalWidth(e.currentTarget.naturalWidth)}
                style={
                  imageScale === "fit"
                    ? {
                        display: "block",
                        maxWidth: "100%",
                        userSelect: "none",
                      }
                    : {
                        display: "block",
                        width:
                          naturalWidth > 0
                            ? `${naturalWidth * imageScale}px`
                            : "100%",
                        maxWidth: "none",
                        userSelect: "none",
                      }
                }
                draggable={false}
              />
              {/* 검출 진행 중 — 이미지 영역의 shimmer 배경 (작업 *위치* 신호).
                  사용자 보고 (2026-05-27): 검출 중인지 멈춘건지 인지 안 됨.
                  카드 본체는 viewport fixed 로 분리 — 아래 별도 element. */}
              {activePage.cropDetectInflight && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(14,165,233,0.06) 25%, rgba(14,165,233,0.18) 50%, rgba(14,165,233,0.06) 75%, rgba(14,165,233,0.18) 100%)",
                    backgroundSize: "200% 200%",
                    backdropFilter: "blur(0.5px)",
                  }}
                  className="animate-detect-shimmer"
                  aria-hidden
                />
              )}
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
            <div className="flex h-full items-center justify-center gap-2 text-muted text-small">
              <Icon name="image" size={20} weight="duotone" className="animate-pulse" />
              <span>이미지 로드 중...</span>
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
              <span className="text-muted">총 검출 문항</span>
              <span className="font-mono font-semibold">{totalDetectedBoxes}</span>
            </div>
            {/* 검출 중 row — 0 이면 muted, > 0 이면 accent-soft 배경 + 스피너 + pulse.
                사용자 보고 (2026-05-27): 진행 중인지 시각적으로 즉시 알 수 있게. */}
            <div
              className={
                detectingCount > 0
                  ? "flex justify-between items-center px-2 -mx-2 py-1 rounded-r1 bg-accent-soft border border-accent/30 animate-loud-pulse"
                  : "flex justify-between"
              }
            >
              <span
                className={`flex items-center gap-1.5 ${
                  detectingCount > 0 ? "text-accent font-semibold" : "text-muted"
                }`}
              >
                {detectingCount > 0 && (
                  <Icon name="circle-notch" size={11} className="animate-spin" />
                )}
                검출 중
              </span>
              <span
                className={`font-mono ${detectingCount > 0 ? "text-accent font-bold" : ""}`}
              >
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
          onClick={() => {
            markCropInspected(activePage.id);
            showToast({
              kind: "success",
              message: `페이지 ${activeIndex + 1} 검토 완료 (박스 ${boxes.length}개)`,
            });
          }}
          disabled={activePage.cropInspected}
        >
          {activePage.cropInspected ? "검토 완료됨" : "이 페이지 검토 완료"}
        </Btn>
        <Btn
          kind="ghost"
          icon="check-square"
          full
          size="sm"
          onClick={() => {
            markAllCropInspected();
            showToast({
              kind: "success",
              message: `모든 페이지 ${totalPages}개 검토 완료`,
            });
          }}
        >
          모든 페이지 일괄 완료
        </Btn>
      </aside>

      {/* 검출 진행 중 카드 — viewport fixed 중앙. 사용자 보고 (2026-05-27):
          "AI가 문항을 검출하고 있어요를 화면 가운데로". 이미지 영역 안 overlay
          (위 shimmer 배경) 와 별도로 카드는 화면 절대 중앙에 떠야 어디 보고
          있어도 즉시 인지. pointer-events: none 으로 박스 편집 차단 안 함. */}
      {activePage.cropDetectInflight && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 50,
          }}
          className="flex flex-col items-center gap-2.5 px-6 py-5 rounded-r3 bg-white/95 shadow-2xl border-2 border-accent/40 animate-loud-pulse"
        >
          <Icon
            name="circle-notch"
            size={32}
            className="text-accent animate-spin"
          />
          <div className="text-subhead font-bold text-accent">
            AI가 문항을 검출하고 있어요
          </div>
          <div className="text-caption text-muted">
            약 3~5초 — 잠시만 기다려주세요
          </div>
        </div>
      )}
    </div>
  );
};

export default Step1_5CropInspect;
