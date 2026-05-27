// EditableCropBox.tsx (Phase I-4)
//
// Step 1.5 검수의 *단일 크롭 박스* 컴포넌트. bbox (0-1000 정규화 그리드) 를
// 페이지 이미지 위에 absolute overlay 로 그림. currentTool 에 따라 동작 분기:
//
//   - **select**: 박스 클릭 → 선택 (border 굵게). 선택 상태에서 본체 드래그로
//     이동, 우하단 corner handle 드래그로 크기 조절.
//   - **create**: pointer-events: none — 박스 자체는 클릭 안 받음. Step 1.5 의
//     부모 (이미지 영역) 가 빈 영역 drag 로 새 박스 생성 책임.
//   - **delete**: 박스 클릭 → 즉시 onDelete 호출.
//
// **bbox 좌표계** (CLAUDE.md §20-2): [yMin, xMin, yMax, xMax] 0–1000 정규화.
// pageWidth/pageHeight 로 화면 px 변환.
//
// **drag 구현**: pointerdown → pointermove (window 에 listener attach) →
// pointerup. clientX/Y 차이를 0-1000 단위로 환산해 onUpdate. AbortController
// 없음 — listener cleanup 만으로 충분 (CLAUDE.md §1-6-b 와 동일 원칙).

import { useCallback, useEffect, useRef, useState } from "react";

import type { CropBox } from "@app/stores/wizardStore";

import type { CropTool } from "./CropEditTools";

export interface EditableCropBoxProps {
  box: CropBox;
  /** 컨테이너 (페이지 이미지) 의 화면 px 크기. bbox 0-1000 정규화 변환용. */
  pageWidth: number;
  pageHeight: number;
  currentTool: CropTool;
  selected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<CropBox>) => void;
  onDelete: (id: string) => void;
}

/**
 * class 별 색상 — 4 way:
 *  - problem (파랑 #0EA5E9): 한 문항 전체
 *  - figure  (녹색 #10B981): vectorize 가능한 기하 도형
 *  - table   (주황 #F97316): bordered grid (표/달력/시간표)
 *  - artwork (보라 #A855F7): vectorize 불가능한 실사 reference (회화/사진)
 *    — SVG 시도 안 함, image crop 만 보존.
 */
const CLASS_COLORS: Record<CropBox["class"], { border: string; bg: string; label: string }> = {
  problem: { border: "#0EA5E9", bg: "rgba(14,165,233,0.08)", label: "문제" },
  figure: { border: "#10B981", bg: "rgba(16,185,129,0.08)", label: "그림" },
  table: { border: "#F97316", bg: "rgba(249,115,22,0.08)", label: "표" },
  artwork: { border: "#A855F7", bg: "rgba(168,85,247,0.08)", label: "작품" },
};

/**
 * 박스 라벨 — problem 일 때 kind 로 객관/서술 구분 (사용자 요청, 2026-05-26).
 * figure/table 은 class 라벨 그대로. problem + kind 미설정 (구버전 session 또는
 * 사용자 수동 추가) 시 "문제" fallback.
 */
const boxLabel = (box: CropBox): string => {
  if (box.class !== "problem") return CLASS_COLORS[box.class].label;
  if (box.kind === "choice") return "객관";
  if (box.kind === "essay") return "서술";
  return CLASS_COLORS.problem.label;
};

/** clamp 0–1000. */
const clamp = (v: number) => Math.max(0, Math.min(1000, v));

type DragMode = "move" | "resize" | null;

export const EditableCropBox = ({
  box,
  pageWidth,
  pageHeight,
  currentTool,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}: EditableCropBoxProps) => {
  const [yMin, xMin, yMax, xMax] = box.bbox;
  const top = (yMin / 1000) * pageHeight;
  const left = (xMin / 1000) * pageWidth;
  const height = ((yMax - yMin) / 1000) * pageHeight;
  const width = ((xMax - xMin) / 1000) * pageWidth;

  const colors = CLASS_COLORS[box.class];

  // drag state
  const dragMode = useRef<DragMode>(null);
  // drag 시작 시점의 박스 bbox + 마우스 위치 (clientX/Y).
  const dragOrigin = useRef<{
    bbox: [number, number, number, number];
    clientX: number;
    clientY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /** clientX/Y delta 를 0-1000 단위로 환산해 patch. */
  const applyDrag = useCallback(
    (e: PointerEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      const dx = ((e.clientX - origin.clientX) / pageWidth) * 1000;
      const dy = ((e.clientY - origin.clientY) / pageHeight) * 1000;
      const [oy, ox, oyMax, oxMax] = origin.bbox;
      let next: [number, number, number, number];
      if (dragMode.current === "move") {
        // 전체 box 이동 (size 보존).
        const w = oxMax - ox;
        const h = oyMax - oy;
        const newX = clamp(ox + dx);
        const newY = clamp(oy + dy);
        // 박스가 페이지 밖으로 나가지 않게 — 우측/하단 한도 적용.
        const cappedX = Math.min(newX, 1000 - w);
        const cappedY = Math.min(newY, 1000 - h);
        next = [cappedY, cappedX, cappedY + h, cappedX + w];
      } else {
        // resize — 우하단 corner만. yMax/xMax 만 갱신.
        const newXMax = clamp(oxMax + dx);
        const newYMax = clamp(oyMax + dy);
        // 최소 크기 보장 (50/1000 = 5%).
        const finalXMax = Math.max(ox + 50, newXMax);
        const finalYMax = Math.max(oy + 50, newYMax);
        next = [oy, ox, finalYMax, finalXMax];
      }
      onUpdate(box.id, { bbox: next });
    },
    [box.id, onUpdate, pageHeight, pageWidth],
  );

  // pointermove / pointerup window listener attach — drag 시작 시
  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: PointerEvent) => applyDrag(e);
    const handleUp = () => {
      dragMode.current = null;
      dragOrigin.current = null;
      setIsDragging(false);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isDragging, applyDrag]);

  const startDrag = (mode: DragMode, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragMode.current = mode;
    dragOrigin.current = {
      bbox: [...box.bbox] as [number, number, number, number],
      clientX: e.clientX,
      clientY: e.clientY,
    };
    setIsDragging(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTool === "delete") {
      onDelete(box.id);
      return;
    }
    if (currentTool === "select") {
      onSelect(box.id);
    }
  };

  // create 모드일 때 박스 자체는 pointer-events: none → 부모 drag 위로 통과.
  const pointerEventsValue =
    currentTool === "create" ? ("none" as const) : ("auto" as const);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onPointerDown={(e) => {
        if (currentTool === "select" && selected) {
          startDrag("move", e);
        }
      }}
      style={{
        position: "absolute",
        top,
        left,
        width,
        height,
        border: `${selected ? 2.5 : 1.5}px solid ${colors.border}`,
        background: colors.bg,
        boxSizing: "border-box",
        cursor:
          currentTool === "delete"
            ? "not-allowed"
            : currentTool === "select" && selected
            ? "move"
            : "pointer",
        pointerEvents: pointerEventsValue,
        userSelect: "none",
        zIndex: selected ? 20 : 10,
      }}
    >
      {/* 박스 라벨 — 좌상단. */}
      <div
        style={{
          position: "absolute",
          top: -1,
          left: -1,
          background: colors.border,
          color: "white",
          fontSize: 10,
          fontWeight: 700,
          padding: "1px 6px",
          fontFamily: "monospace",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}
      >
        {box.number !== undefined ? `${box.number}` : "?"} · {boxLabel(box)}
      </div>

      {/* 우하단 resize handle — select 모드 + selected 일 때만 */}
      {currentTool === "select" && selected && (
        <div
          onPointerDown={(e) => startDrag("resize", e)}
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            background: "white",
            border: `2px solid ${colors.border}`,
            borderRadius: 2,
            cursor: "nwse-resize",
            zIndex: 30,
          }}
          aria-label="크기 조절"
        />
      )}

      {/* delete 모드일 때 우상단에 ✕ 표시 */}
      {currentTool === "delete" && (
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 16,
            height: 16,
            display: "grid",
            placeItems: "center",
            background: "#EF4444",
            color: "white",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 2,
            pointerEvents: "none",
          }}
        >
          ✕
        </div>
      )}
    </div>
  );
};

export default EditableCropBox;
