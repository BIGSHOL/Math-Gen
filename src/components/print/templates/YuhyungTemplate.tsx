// YuhyungTemplate.tsx (T6) — 유형 훈련지 (같은 유형 반복, 컴팩트)
// design_handoff 카피 + import path 조정 + options.accentColor → options.color.

import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

export function YuhyungTemplate({
  page,
  columns,
  meta,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const accent = options.color || PAPER_COLORS.accentSlate;
  const isFirstPage = page === 1;
  const fs = bodyFontSize("yuhyung", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    return (
      <div key={p.id} data-measure-idx={i} style={{ breakInside: "avoid", paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 4 }}>
          <QuestionNumber template="yuhyung" num={num} accent={accent} />
          {options.showChapter && p.variant.topic && (
            <span
              style={{
                fontFamily: "var(--paper-font-sans)",
                fontSize: 9,
                color: PAPER_COLORS.ink50,
                letterSpacing: "0.08em",
              }}
            >
              {p.variant.topic}
            </span>
          )}
        </div>
        <ProblemBody problem={p.variant} fontSize={fs} />
      </div>
    );
  };

  // 측정 모드 — 본문만 1단 flow, 타겟 컬럼 폭.
  if (measure) {
    return (
      <div
        style={{
          width: measure.columnWidthPx,
          fontFamily: "var(--paper-font-serif)",
          fontSize: fs,
          lineHeight: 1.65,
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
        padding: "28px 44px 16px",
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
          {/* 유형 배너 */}
          <div
            style={{
              background: PAPER_COLORS.ink,
              color: "white",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.32em",
                  color: PAPER_COLORS.ink30,
                }}
              >
                PATTERN
              </span>
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 17,
                  fontWeight: 800,
                  letterSpacing: "-0.01em",
                }}
              >
                {meta.patternName ?? meta.title}
              </span>
            </div>
            <div
              style={{
                fontFamily: "var(--paper-font-mono)",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: "rgba(255,255,255,0.12)",
                padding: "4px 10px",
              }}
            >
              {String(problems.length).padStart(2, "0")} 문항
            </div>
          </div>

          {/* 전략 + 이름·날짜 */}
          {meta.patternStrategy && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 16,
                padding: "6px 0",
                borderBottom: `1px solid ${PAPER_COLORS.ink15}`,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: accent,
                  letterSpacing: "0.12em",
                }}
              >
                핵심 전략
              </span>
              <span
                style={{
                  fontFamily: "var(--paper-font-serif)",
                  fontSize: 11.5,
                  color: PAPER_COLORS.ink90,
                }}
              >
                {meta.patternStrategy}
              </span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  fontFamily: "var(--paper-font-sans)",
                  fontSize: 10,
                  color: PAPER_COLORS.ink50,
                }}
              >
                이름 ____________ · 날짜 ___________
              </span>
            </div>
          )}
        </>
      )}

      <BodyContainer
        columns={columns}
        gap={gap}
        columnGap={22}
        columnRule={PAPER_COLORS.ink08}
        splitIndex={splitIndex}
        style={{ fontSize: fs, lineHeight: 1.65 }}
      >
        {problems.map(renderItem)}
      </BodyContainer>

      {/* 푸터 — 진도 바 */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: "var(--paper-font-sans)",
          fontSize: 9.5,
          color: PAPER_COLORS.ink50,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.1em",
          }}
        >
          PROGRESS
        </span>
        <div
          style={{
            flex: 1,
            height: 3,
            background: PAPER_COLORS.ink08,
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${Math.round((page / Math.max(1, problems.length)) * 100)}%`,
              height: "100%",
              background: accent,
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--paper-font-mono)",
            fontWeight: 700,
            color: PAPER_COLORS.ink,
          }}
        >
          PG · {page}
        </span>
      </div>
    </div>
  );
}
