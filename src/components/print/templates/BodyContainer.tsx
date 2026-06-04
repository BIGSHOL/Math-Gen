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
  /**
   * count 모드 — 컬럼당 고정 개수일 때, 문항을 컬럼 높이에 맞춰 *자동 균등 분배*
   * (justify-content: space-between). 첫 문항은 *상단에 붙이고*(사용자 보고
   * 2026-06-04: 최상단 문항은 항상 상단 정렬), 남는 공간을 문항 *사이* 에 균등
   * 배분 → "단별 N문항 + 깔끔한 여백". 마지막 페이지 1문항도 space-between 이면
   * 가운데가 아니라 상단 정렬됨. gap 12px 는 최소 간격.
   */
  distribute?: boolean;
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
  distribute,
  className,
  style,
}: BodyContainerProps) {
  // `measure-body` — probe shell 이 가용 높이를 읽고, 긴 수식 clamp CSS 가 거는
  // 마커. 모든 BodyContainer 에 부여 (preview·print·measure 모두 동일 적용).
  const mergedClass = ["measure-body", className].filter(Boolean).join(" ");

  // count 모드(distribute): 컬럼을 *문항 수만큼 N등분*. 각 문항을 flex:1 슬롯으로
  // 감싸 균등 분할 → 문항은 슬롯 *상단* 에 붙고 남는 슬롯 높이가 *풀이 여백*. 첫
  // 문항은 상단 정렬, 마지막 문항도 하단에 안 붙고 풀이공간을 가진다 (사용자 보고
  // 2026-06-04: "n등분 + 문제풀이공간 3~5줄"). gap 12px 는 슬롯 사이 최소 간격.
  const colGap = distribute ? 12 : gap;
  const wrapSlots = (nodes: React.ReactNode): React.ReactNode =>
    distribute
      ? React.Children.map(nodes, (child) => (
          <div style={{ flex: "1 1 0", minHeight: 0 }}>{child}</div>
        ))
      : nodes;

  if (columns === 2) {
    const items = React.Children.toArray(children);
    const split = splitIndex ?? Math.ceil(items.length / 2);
    const colStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: `${colGap}px`,
      minWidth: 0,
      // 슬롯(flex:1)이 컬럼 높이를 나누려면 컬럼이 definite height 여야 함 — grid
      // stretch + height:100% 로 보장 (distribute 일 때만).
      ...(distribute ? { height: "100%" } : {}),
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
        <div style={colStyle}>{wrapSlots(items.slice(0, split))}</div>
        {columnRule !== null && (
          <div
            style={{
              width: 1,
              background: columnRule || PAPER_COLORS.ink08,
            }}
          />
        )}
        <div style={colStyle}>{wrapSlots(items.slice(split))}</div>
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
        gap: `${colGap}px`,
        ...style,
      }}
    >
      {wrapSlots(children)}
    </div>
  );
}
