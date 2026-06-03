// JaseupTemplate.tsx (T5) — 자습 학습지 (개념박스 + 모눈 풀이공간)
// design_handoff 카피 + import path 조정 + options.accentColor → options.color
// + MarkdownRenderer 실제 import.

import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

export function JaseupTemplate({
  page,
  columns,
  meta,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const accent = options.color || PAPER_COLORS.accentGold;
  const isFirstPage = page === 1;
  const fs = bodyFontSize("jaseup", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    return (
      <div
        key={p.id}
        data-measure-idx={i}
        style={{
          flex: columns === 1 ? 1 : undefined,
          display: columns === 1 ? "grid" : "block",
          gridTemplateColumns: "1.15fr 1fr",
          gap: 14,
          paddingBottom: 14,
          borderBottom: `1px dashed ${PAPER_COLORS.ink15}`,
          breakInside: "avoid",
          minHeight: 0,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
            <QuestionNumber template="jaseup" num={num} accent={accent} />
            {options.showChapter && p.variant.topic && (
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10,
                  color: PAPER_COLORS.ink50,
                  letterSpacing: "0.08em",
                }}
              >
                · {p.variant.topic}
              </span>
            )}
          </div>
          <ProblemBody problem={p.variant} fontSize={fs} />
          {/* 정답 기록 칸 */}
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              background: PAPER_COLORS.paperWarm,
              border: `1px solid ${PAPER_COLORS.ink15}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--paper-font-sans)",
              fontSize: 11,
            }}
          >
            <span style={{ fontWeight: 700, color: accent }}>내 정답</span>
            <span style={{ flex: 1, borderBottom: `1px solid ${PAPER_COLORS.ink30}`, height: 16 }} />
            <span style={{ fontSize: 10, color: PAPER_COLORS.ink50 }}>✓ 채점</span>
            <span
              style={{
                width: 16,
                height: 16,
                border: `1.5px solid ${PAPER_COLORS.ink30}`,
                display: "inline-block",
              }}
            />
          </div>
        </div>
        {/* 모눈 풀이공간 — 1단만 */}
        {columns === 1 && (
          <div
            style={{
              backgroundImage: `linear-gradient(${PAPER_COLORS.ink08} 1px, transparent 1px), linear-gradient(90deg, ${PAPER_COLORS.ink08} 1px, transparent 1px)`,
              backgroundSize: "16px 16px",
              backgroundColor: PAPER_COLORS.paper,
              border: `1px solid ${PAPER_COLORS.ink15}`,
              minHeight: 100,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 6,
                right: 8,
                fontFamily: "var(--paper-font-sans)",
                fontSize: 9,
                color: PAPER_COLORS.ink30,
                letterSpacing: "0.12em",
              }}
            >
              SCRATCH PAD
            </div>
          </div>
        )}
      </div>
    );
  };

  // 측정 모드 — 본문만 1단 flow. (1단 stretch 는 개수패킹이라 높이 무시, 2단 실측.)
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
        background: PAPER_COLORS.paperWarm,
        padding: "36px 50px 20px",
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
          {/* 헤더 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 12,
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: accent,
                  letterSpacing: "0.3em",
                  marginBottom: 4,
                }}
              >
                SELF-STUDY
              </div>
              <div
                style={{
                  fontFamily: "var(--paper-font-serif)",
                  fontSize: 24,
                  fontWeight: 800,
                  color: PAPER_COLORS.ink,
                  letterSpacing: "-0.01em",
                }}
              >
                {meta.title}
              </div>
              {meta.todayGoal && (
                <div
                  style={{
                    fontFamily: "var(--paper-font-sans)",
                    fontSize: 11,
                    color: PAPER_COLORS.ink70,
                    marginTop: 4,
                  }}
                >
                  오늘의 목표 · {meta.todayGoal}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 9.5,
                  color: PAPER_COLORS.ink50,
                  marginBottom: 2,
                }}
              >
                학습일
              </div>
              <div
                style={{
                  fontFamily: "var(--paper-font-serif)",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {meta.examDate ?? "—"}
              </div>
            </div>
          </div>

          {/* 개념 박스 */}
          {meta.conceptNote && (
            <div
              style={{
                background: PAPER_COLORS.paper,
                border: `1px solid ${accent}`,
                borderLeft: `5px solid ${accent}`,
                padding: "12px 16px",
                marginBottom: 18,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: accent,
                  letterSpacing: "0.16em",
                  marginBottom: 6,
                }}
              >
                ◆ 핵심 개념 정리
              </div>
              <div
                style={{
                  fontFamily: "var(--paper-font-serif)",
                  fontSize: 12,
                  lineHeight: 1.7,
                  color: PAPER_COLORS.ink90,
                }}
              >
                <MarkdownRenderer content={meta.conceptNote} />
              </div>
            </div>
          )}
        </>
      )}

      <BodyContainer columns={columns} gap={gap} splitIndex={splitIndex}>
        {problems.map(renderItem)}
      </BodyContainer>

      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--paper-font-sans)",
          fontSize: 10,
          color: PAPER_COLORS.ink50,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.12em",
          }}
        >
          오늘의 메모
        </span>
        <span
          style={{
            flex: 1,
            borderBottom: `1px dashed ${PAPER_COLORS.ink30}`,
            height: 1,
          }}
        />
        <span>p. {page}</span>
      </div>
    </div>
  );
}
