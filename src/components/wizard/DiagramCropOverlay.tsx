import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Btn, Card, Eyebrow, Icon } from "@app/components/ui";
import { ModalShell } from "@app/components/modal";
import { cropPageImageData } from "@app/lib/pdfProcessor";
import type { CropBox, OCRImage } from "@app/stores/wizardStore";
import { showToast } from "@app/stores/toastStore";

import { EditableCropBox } from "./EditableCropBox";

/**
 * Phase #12 — 사용자가 OCRItem 안에서 도형 박스를 *직접* 편집하는 mini-editor 모달.
 *
 * Step 1.5 의 EditableCropBox 컴포넌트 재사용 — *단일 박스* 편집 mode 로.
 * Step 1.5 와 달리:
 *  - 박스 1 개만 (현재 편집 중인 도형)
 *  - tool="select" 고정 (이동 + resize)
 *  - 삭제 / 추가 X
 *
 * **흐름**:
 *  1. mount 시 props.initialBox 를 로컬 state 로 복사
 *  2. EditableCropBox 가 박스 이동/리사이즈 → onUpdate → local state 갱신
 *  3. "저장" 클릭 → cropPageImageData(pageImageDataUrl, finalBbox) 동기 호출
 *  4. 결과 dataUrl + bbox → onSave(box, dataUrl)
 *  5. parent (OCRItem) 가 images[imageIndex] 를 `{ ...기존, box, source: "user-crop", dataUrl }` 로 교체
 *
 * **좌표계**: 박스 bbox 는 *페이지 전체 기준* 0-1000 정규화 — Step 1.5 와 동일.
 * 모달 안에서 페이지 이미지를 그대로 표시하고, 박스 overlay 좌표 변환은
 * EditableCropBox 가 pageWidth/pageHeight 기반으로 처리.
 *
 * **사용자 보고 (2026-05-27)**: "도형이 잘못 잡혔으면 직접 박스 그릴 수 있도록" —
 * OCRItem 의 DiagramFallbackPanel "박스 편집" 버튼이 이 모달 트리거.
 */
export interface DiagramCropOverlayProps {
  open: boolean;
  /** 페이지 전체의 hi-res 이미지 dataUrl (cropPageImageData 의 입력). */
  pageImageDataUrl: string | null;
  /** 편집할 OCRImage 의 초기 box + label. */
  initialImage: OCRImage;
  /** 보여줄 박스 번호 표시용 (예: "도형 1 / 3"). */
  imageIndex: number;
  totalImages: number;
  /** 저장 시 호출 — 새 box + cropped dataUrl. */
  onSave: (newImage: OCRImage) => void;
  onClose: () => void;
}

const STORAGE_CROP_MARGIN = 0.04;

export const DiagramCropOverlay = ({
  open,
  pageImageDataUrl,
  initialImage,
  imageIndex,
  totalImages,
  onSave,
  onClose,
}: DiagramCropOverlayProps) => {
  // 모달 안 박스 — EditableCropBox 가 요구하는 CropBox 형태로 wrap.
  // class="figure" 으로 표시 (도형 라벨 — 녹색).
  const [box, setBox] = useState<CropBox>(() => initialBoxFrom(initialImage));
  const [saving, setSaving] = useState(false);

  // mount / initialImage 변경 시 reset
  useEffect(() => {
    if (open) {
      setBox(initialBoxFrom(initialImage));
    }
  }, [open, initialImage]);

  // 이미지 컨테이너 ref + 실제 px 크기 (ResizeObserver — Step 1.5 와 동일 패턴)
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // 페이지 이미지의 *자연 픽셀 크기* — 박스 크기 표시 (사용자 결정 2026-05-27: % 대신 px)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!open) return;
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [open, pageImageDataUrl]);
  // pageImageDataUrl → Image() 로 자연 픽셀 크기 추출 (containerRef 크기는 *display* 라 부정확)
  useEffect(() => {
    if (!pageImageDataUrl) {
      setNaturalSize({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = pageImageDataUrl;
  }, [pageImageDataUrl]);

  const handleBoxUpdate = useCallback((_id: string, patch: Partial<CropBox>) => {
    setBox((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!pageImageDataUrl) {
      showToast({ kind: "error", message: "페이지 이미지 없음 — 다시 시도하세요." });
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await cropPageImageData(pageImageDataUrl, box.bbox, {
        margin: STORAGE_CROP_MARGIN,
      });
      const newImage: OCRImage = {
        ...initialImage,
        box: box.bbox,
        source: "user-crop",
        dataUrl,
        // user-crop 는 ai-gen 필드 strip
        url: undefined,
        prompt: undefined,
        generatedAt: undefined,
      };
      onSave(newImage);
      showToast({
        kind: "success",
        message: "도형 박스 저장 완료",
        durationMs: 1800,
      });
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[DiagramCropOverlay] crop 실패:", (err as Error).message);
      showToast({
        kind: "error",
        message: `크롭 실패: ${(err as Error).message}`,
      });
    } finally {
      setSaving(false);
    }
  }, [saving, pageImageDataUrl, box.bbox, initialImage, onSave, onClose]);

  // 박스 크기·위치 안내 라벨 — 페이지 자연 픽셀 크기 기반 (사용자 결정 2026-05-27)
  const sizeHint = useMemo(() => {
    const [yMin, xMin, yMax, xMax] = box.bbox;
    if (naturalSize.width === 0 || naturalSize.height === 0) {
      // 자연 크기 미로딩 — % fallback
      const w = ((xMax - xMin) / 10).toFixed(1);
      const h = ((yMax - yMin) / 10).toFixed(1);
      return `${w}% × ${h}%`;
    }
    const wpx = Math.round(((xMax - xMin) / 1000) * naturalSize.width);
    const hpx = Math.round(((yMax - yMin) / 1000) * naturalSize.height);
    return `${wpx} × ${hpx} px`;
  }, [box.bbox, naturalSize]);

  return (
    <ModalShell
      open={open}
      onClose={saving ? () => undefined : onClose}
      className="w-full max-w-[920px] max-h-[90vh]"
      aria-labelledby="diagram-crop-title"
    >
      <div className="px-5 py-3 border-b border-line flex items-center justify-between">
        <div>
          <h2
            id="diagram-crop-title"
            className="text-subhead font-semibold text-ink flex items-center gap-2"
          >
            <Icon name="crop" size={18} className="text-accent" />
            도형 박스 편집
          </h2>
          <p className="text-caption text-muted mt-0.5">
            도형 {imageIndex + 1} / {totalImages} — 박스를 드래그/리사이즈하면 새로 크롭됩니다
          </p>
        </div>
        <Eyebrow>{sizeHint}</Eyebrow>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-surface2 p-3 flex items-start justify-center">
        {pageImageDataUrl ? (
          <div
            ref={containerRef}
            style={{
              position: "relative",
              display: "inline-block",
              cursor: "default",
            }}
          >
            <img
              src={pageImageDataUrl}
              alt="페이지 미리보기"
              style={{
                display: "block",
                // 전체 페이지가 모달 안에 *한눈에* 들어오도록 폭·높이 둘 다 제한.
                // 이전엔 maxWidth 만 있어서 세로로 긴 시험지가 모달보다 훨씬
                // 길어져 스크롤·짤림 (사용자 보고 2026-06-03). 높이 = 모달
                // 90vh - 헤더/푸터/패딩(~9rem). 컨테이너가 inline-block 이라
                // 줄어든 이미지에 맞춰 shrink → 박스 overlay 좌표 자동 정렬.
                maxWidth: "100%",
                maxHeight: "calc(90vh - 9rem)",
                userSelect: "none",
              }}
              draggable={false}
            />
            {containerSize.width > 0 && (
              <EditableCropBox
                box={box}
                pageWidth={containerSize.width}
                pageHeight={containerSize.height}
                currentTool="select"
                selected={true}
                onSelect={() => undefined}
                onUpdate={handleBoxUpdate}
                onDelete={() => undefined}
              />
            )}
          </div>
        ) : (
          <Card pad={20} className="text-center text-muted">
            <Icon name="image" size={24} weight="duotone" />
            <div className="mt-2">페이지 이미지 로드 실패</div>
          </Card>
        )}
      </div>

      <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-2 bg-surface2">
        <div className="text-caption text-muted flex items-center gap-1">
          <Icon name="hand-pointing" size={12} />
          박스 안 드래그 = 이동 · 모서리/엣지 핸들 = 크기 조절
        </div>
        <div className="flex items-center gap-2">
          <Btn kind="ghost" onClick={onClose} disabled={saving}>
            취소
          </Btn>
          <Btn
            kind="accent"
            icon={saving ? "circle-notch" : "check"}
            onClick={handleSave}
            disabled={saving || !pageImageDataUrl}
          >
            {saving ? "저장 중..." : "저장"}
          </Btn>
        </div>
      </div>
    </ModalShell>
  );
};

// ============================================================================
// helper
// ============================================================================

const initialBoxFrom = (img: OCRImage): CropBox => ({
  id: `overlay-${Date.now()}`,
  class: "figure",
  bbox: img.box,
  verified: false,
  source: "user", // EditableCropBox 의 source 와 OCRImage.source 는 다른 도메인 (CropBox source vs OCRImage source)
  // label 은 CropBox 에 없음 — EditableCropBox 가 class 기반으로 자동 표시
});

export default DiagramCropOverlay;
