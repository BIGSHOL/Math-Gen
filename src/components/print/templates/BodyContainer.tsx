// BodyContainer.tsx
// 1단/2단 본문 컨테이너. flex 기반 분할 (CSS columns 사용 안 함 — column-fill
// 동작이 종이 끝까지 차지 않아서).
//
// 1단:
//   flex column + 일정 gap. 페이지가 가득 안 차면 자연 빈공간.
//   풀이공간 카드는 자식에 `flex: 1` 명시해서 stretch.
//
// 2단:
//   문항 React children 을 정확히 절반으로 분할 → 좌우 grid 컬럼.
//   각 컬럼은 flex column + 일정 gap.
//   가운데 columnRule (옵션) 1px.
//
// design_handoff/src/BodyContainer.tsx 그대로 — import path 만 ../tokens.

import React from "react";
import { PAPER_COLORS } from "../tokens";

interface BodyContainerProps {
  children: React.ReactNode;
  columns: 1 | 2;
  /** 문항 사이 gap (px). 기본 16. */
  gap?: number;
  /** 2단일 때 좌우 컬럼 사이 gap (px). 기본 26. */
  columnGap?: number;
  /** 2단일 때 가운데 세로선. `null` 이면 안 그림. CSS 색상 문자열. */
  columnRule?: string | null;
  /**
   * 2단 우측 컬럼 시작 인덱스. usePrintLayout 의 측정 패킹이 정한 분할점.
   * 없으면 children 개수 절반 (Math.ceil(n/2)) — 기존 동작 (회귀 0).
   */
  splitIndex?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function BodyContainer({
  children,
  columns,
  gap = 16,
  columnGap = 26,
  columnRule,
  splitIndex,
  className,
  style,
}: BodyContainerProps) {
  // `measure-body` — probe shell 이 가용 높이를 읽고, 긴 수식 clamp CSS 가 거는
  // 마커. 모든 BodyContainer 에 부여 (preview·print·measure 모두 동일 적용).
  const mergedClass = ["measure-body", className].filter(Boolean).join(" ");

  if (columns === 2) {
    const items = React.Children.toArray(children);
    const split = splitIndex ?? Math.ceil(items.length / 2);
    const colStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: `${gap}px`,
      minWidth: 0,
    };
    return (
      <div
        className={mergedClass}
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: columnRule === null ? "1fr 1fr" : "1fr 1px 1fr",
          gap: `0 ${columnGap / 2}px`,
          ...style,
        }}
      >
        <div style={colStyle}>{items.slice(0, split)}</div>
        {columnRule !== null && (
          <div
            style={{
              width: 1,
              background: columnRule || PAPER_COLORS.ink08,
            }}
          />
        )}
        <div style={colStyle}>{items.slice(split)}</div>
      </div>
    );
  }

  // 1단
  return (
    <div
      className={mergedClass}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: `${gap}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
