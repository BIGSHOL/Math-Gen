// WorkbookTemplate.tsx (T4) — 학원 워크북 (풀이공간 포함)
// design_handoff 카피 + import path 조정 + options.accentColor → options.color.

import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber, PointsLabel } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

export function WorkbookTemplate({
  page,
  columns,
  meta,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const accent = options.color || PAPER_COLORS.accentRed;
  const isFirstPage = page === 1;
  const fs = bodyFontSize("workbook", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    const points = p.variant.points ?? 3;
    return (
      <div
        key={p.id}
        data-measure-idx={i}
        style={{
          // 1단: 카드가 flex: 1 로 균등 stretch → 풀이공간 자동 확장
          flex: columns === 1 ? 1 : undefined,
          display: columns === 1 ? "grid" : "block",
          gridTemplateColumns: "1.3fr 1fr",
          gap: 16,
          border: `1px solid ${PAPER_COLORS.ink15}`,
          padding: "12px 14px",
          background: PAPER_COLORS.paper,
          breakInside: "avoid",
          minHeight: 0,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <QuestionNumber template="workbook" num={num} accent={accent} />
            {options.showChapter && p.variant.topic && (
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: PAPER_COLORS.ink50,
                  letterSpacing: "0.1em",
                }}
              >
                {p.variant.topic.toUpperCase()}
              </span>
            )}
            <span style={{ flex: 1 }} />
            <PointsLabel points={points} />
          </div>
          <ProblemBody problem={p.variant} fontSize={fs} />
        </div>
        {/* 풀이공간 — 1단에서만 (카드 flex:1 → grid stretch → 자연 확장) */}
        {columns === 1 && (
          <div
            style={{
              borderLeft: `1px dashed ${PAPER_COLORS.ink30}`,
              padding: "0 6px 0 12px",
              backgroundImage: `linear-gradient(transparent 0px, transparent 23px, ${PAPER_COLORS.ink08} 24px)`,
              backgroundSize: "100% 24px",
              minHeight: 100,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -2,
                left: 12,
                background: PAPER_COLORS.paper,
                padding: "0 6px",
                fontFamily: "var(--paper-font-sans)",
                fontSize: 9.5,
                fontWeight: 700,
                color: accent,
                letterSpacing: "0.1em",
              }}
            >
              풀이 SCRATCH
            </div>
          </div>
        )}
      </div>
    );
  };

  // 측정 모드 — 본문만 1단 flow. (1단 stretch 는 printPack 개수패킹이라 높이 무시,
  // 2단 block 은 실측.)
  if (measure) {
    return (
      <div
        style={{
          width: measure.columnWidthPx,
          fontFamily: "var(--paper-font-serif)",
          fontSize: fs,
          lineHeight: 1.6,
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
        padding: "32px 44px 20px",
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
      {isFirstPage && (
        <>
          {/* 학원 헤더 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: accent,
                  color: "white",
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "var(--paper-font-sans)",
                  fontWeight: 900,
                  fontSize: 18,
                  letterSpacing: "-0.04em",
                }}
              >
                {meta.academyName?.[0] ?? "M"}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: "var(--paper-font-sans)",
                    fontWeight: 800,
                    fontSize: 17,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {meta.academyName ?? "수학 학원"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--paper-font-sans)",
                    fontSize: 10.5,
                    color: PAPER_COLORS.ink50,
                    letterSpacing: "0.04em",
                  }}
                >
                  MATH ACADEMY WORKBOOK
                </div>
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--paper-font-sans)",
                fontSize: 11,
                color: PAPER_COLORS.ink70,
                textAlign: "right",
              }}
            >
              <div>
                <span style={{ color: PAPER_COLORS.ink50 }}>강의</span> ·{" "}
                {meta.instructorName ?? "—"} T
              </div>
              <div>
                <span style={{ color: PAPER_COLORS.ink50 }}>일자</span> ·{" "}
                {meta.examDate ?? "—"}
              </div>
            </div>
          </div>

          {/* 단원 배너 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              background: PAPER_COLORS.ink,
              color: "white",
              padding: "10px 16px",
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1 }}>
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: "-0.01em",
                }}
              >
                {meta.title}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--paper-font-sans)",
                fontSize: 11,
                display: "flex",
                gap: 14,
              }}
            >
              <span>
                <span style={{ color: PAPER_COLORS.ink30 }}>이름</span> ___________
              </span>
              <span>
                <span style={{ color: PAPER_COLORS.ink30 }}>날짜</span> ___________
              </span>
            </div>
          </div>
        </>
      )}

      <BodyContainer
        columns={columns}
        gap={gap}
        splitIndex={splitIndex}
        distribute={options.layoutMode === "count"}
        style={{ marginTop: 16 }}
      >
        {problems.map(renderItem)}
      </BodyContainer>

      {/* 푸터 */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--paper-font-sans)",
          fontSize: 9.5,
          color: PAPER_COLORS.ink50,
          flexShrink: 0,
        }}
      >
        <span>
          {meta.academyName ?? "워크북"} · {meta.title}
          {columns === 2 ? " · 컴팩트" : ""}
        </span>
        <span style={{ fontWeight: 700 }}>page {page}</span>
      </div>
    </div>
  );
}
