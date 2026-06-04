// PyeonggaTemplate.tsx (T1) — 평가원 정밀형 (수능·모의평가 클론)
// design_handoff 의 동명 파일 그대로 + import path 조정 + ProblemBody placeholder
// → 실제 import 로 교체.

import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber, PointsLabel } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

export function PyeonggaTemplate({
  page,
  columns,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const isFirstPage = page === 1;
  const fs = bodyFontSize("pyeongga", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    const points = p.variant.points ?? 3;
    return (
      <div key={p.id} data-measure-idx={i} style={{ breakInside: "avoid", paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
          <QuestionNumber template="pyeongga" num={num} accent={PAPER_COLORS.ink} />
          <span style={{ flex: 1 }} />
          <PointsLabel points={points} />
        </div>
        <ProblemBody problem={p.variant} fontSize={fs} />
      </div>
    );
  };

  // 측정 모드 — 본문만 1단 flow, 타겟 컬럼 폭 (BodyContainer "0 56px" 패딩은
  // columnWidthPx 가 이미 반영 — 측정 래퍼엔 패딩 없음).
  if (measure) {
    return (
      <div
        style={{
          width: measure.columnWidthPx,
          fontFamily: "var(--paper-font-serif)",
          fontSize: fs,
          lineHeight: 1.75,
        }}
      >
        <BodyContainer columns={1} gap={gap}>
          {problems.map(renderItem)}
        </BodyContainer>
      </div>
    );
  }

  return (
    <div
      style={{
        width: A4_DIM.width,
        height: A4_DIM.height,
        background: PAPER_COLORS.paper,
        padding: 0,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        fontFamily: "var(--paper-font-serif)",
        color: PAPER_COLORS.ink,
        fontSize: 13,
        lineHeight: 1.6,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* 헤더 — 첫 페이지만 큰 박스, 이후 페이지는 간소 */}
      {isFirstPage ? (
        <div style={{ padding: "42px 56px 18px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              border: `2.5px solid ${PAPER_COLORS.ink}`,
              height: 56,
              marginBottom: 22,
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: "0.18em",
                borderRight: `2.5px solid ${PAPER_COLORS.ink}`,
              }}
            >
              수학 영역
            </div>
            <div
              style={{
                width: 124,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              제 1 교시
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11.5,
              color: PAPER_COLORS.ink70,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  width: 24,
                  height: 16,
                  border: `1.5px solid ${PAPER_COLORS.ink}`,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                홀
              </span>
              <span style={{ fontWeight: 600 }}>5지 선다형</span>
            </span>
            <span style={{ fontWeight: 600 }}>● 다음 물음에 답하시오.</span>
          </div>
        </div>
      ) : (
        <div
          style={{
            padding: "20px 56px 8px",
            fontSize: 11,
            color: PAPER_COLORS.ink50,
            display: "flex",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span>수학 영역</span>
          <span style={{ fontFamily: "var(--paper-font-mono)" }}>{page}</span>
        </div>
      )}

      <BodyContainer
        columns={columns}
        gap={gap}
        splitIndex={splitIndex}
        distribute={options.layoutMode === "count"}
        style={{ padding: "0 56px 30px", fontSize: fs, lineHeight: 1.75 }}
      >
        {problems.map(renderItem)}
      </BodyContainer>

      {/* 푸터 */}
      <div
        style={{
          margin: "0 56px 12px",
          paddingTop: 6,
          borderTop: `1px solid ${PAPER_COLORS.ink}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        <span>수학 영역</span>
        <span style={{ fontFamily: "var(--paper-font-mono)" }}>{page}</span>
      </div>
    </div>
  );
}
