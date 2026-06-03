// ModernTemplate.tsx (T3) — 모던 내신형 (학교 마케팅 / 세련된 톤)
// design_handoff 카피 + import path 조정 + options.accentColor → options.color
// (Mathgen 의 PrintOptions 는 `color` 사용).

import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

export function ModernTemplate({
  page,
  totalPages,
  columns,
  meta,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const accent = options.color || PAPER_COLORS.accentNavy;
  const isFirstPage = page === 1;
  const fs = bodyFontSize("modern", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    const points = p.variant.points ?? 3;
    return (
      <div key={p.id} data-measure-idx={i} style={{ breakInside: "avoid", paddingBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
          <QuestionNumber template="modern" num={num} accent={accent} />
          {options.showChapter && p.variant.topic && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: PAPER_COLORS.ink50,
                fontFamily: "var(--paper-font-sans)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {p.variant.topic}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontFamily: "var(--paper-font-sans)",
              fontSize: 11,
              fontWeight: 700,
              color: accent,
              padding: "2px 8px",
              border: `1px solid ${accent}`,
              borderRadius: 999,
            }}
          >
            {points}점
          </span>
        </div>
        <div style={{ paddingLeft: 28 }}>
          <ProblemBody problem={p.variant} fontSize={fs} />
        </div>
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
          lineHeight: 1.85,
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
        padding: "40px 56px 24px",
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
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              paddingBottom: 12,
              borderBottom: `3px solid ${accent}`,
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: accent,
                  letterSpacing: "0.32em",
                  fontFamily: "var(--paper-font-sans)",
                  marginBottom: 4,
                }}
              >
                {meta.semester ?? "2025 · 1ST SEMESTER · MIDTERM"}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: PAPER_COLORS.ink,
                  fontFamily: "var(--paper-font-sans)",
                  letterSpacing: "-0.02em",
                }}
              >
                {meta.schoolName ?? "○○고등학교"}{" "}
                <span style={{ fontWeight: 500, color: PAPER_COLORS.ink50 }}>
                  · {meta.grade ?? "2학년"} {meta.subject}
                </span>
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: PAPER_COLORS.ink70,
                  fontFamily: "var(--paper-font-sans)",
                }}
              >
                {meta.examDate ?? "—"} · {meta.examDuration ?? "50분"} · {problems.length}
                문항 ({meta.totalScore ?? 100}점)
              </div>
            </div>
            <div
              style={{
                padding: "8px 14px",
                border: `2px solid ${accent}`,
                color: accent,
                fontFamily: "var(--paper-font-sans)",
                fontWeight: 800,
                fontSize: 14,
                letterSpacing: "0.12em",
              }}
            >
              {meta.title.includes("중간")
                ? "중간고사"
                : meta.title.includes("기말")
                ? "기말고사"
                : "평가"}
            </div>
          </div>

          {/* 학생 정보 6-cell */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr) 1.2fr",
              marginTop: 18,
              border: `1.5px solid ${PAPER_COLORS.ink30}`,
              flexShrink: 0,
            }}
          >
            {(
              [
                ["학년", meta.grade ?? ""],
                ["반", ""],
                ["번호", ""],
                ["성명", ""],
                ["감독", ""],
                ["점수", `/ ${meta.totalScore ?? 100}`],
              ] as Array<[string, string]>
            ).map(([l, v], i) => (
              <div
                key={l}
                style={{
                  padding: "10px 14px",
                  borderRight: i < 5 ? `1px solid ${PAPER_COLORS.ink15}` : undefined,
                  background: i === 5 ? PAPER_COLORS.ink04 : PAPER_COLORS.paper,
                  fontFamily: "var(--paper-font-sans)",
                }}
              >
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: accent,
                    marginBottom: 3,
                  }}
                >
                  {l.toUpperCase()}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {v || <span style={{ color: PAPER_COLORS.ink15 }}>______</span>}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: "8px 0",
              fontSize: 10.5,
              color: PAPER_COLORS.ink70,
              fontFamily: "var(--paper-font-sans)",
              letterSpacing: "0.02em",
              flexShrink: 0,
            }}
          >
            <span style={{ fontWeight: 700, color: accent }}>! </span>
            OMR 카드에 컴퓨터용 사인펜으로 표기 · 한 문항 중복 표기 시 0점 처리 · 계산기·전자기기 사용 금지
          </div>

          <div
            style={{
              height: 1,
              background: PAPER_COLORS.ink08,
              marginBottom: 20,
              flexShrink: 0,
            }}
          />
        </>
      )}

      <BodyContainer
        columns={columns}
        gap={gap}
        columnGap={32}
        splitIndex={splitIndex}
        style={{ fontSize: fs, lineHeight: 1.85 }}
      >
        {problems.map(renderItem)}
      </BodyContainer>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--paper-font-sans)",
          fontSize: 10,
          color: PAPER_COLORS.ink50,
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        <span>
          {meta.schoolName ?? "○○고등학교"} · {meta.grade ?? "2학년"} {meta.subject}
        </span>
        <span style={{ fontWeight: 700, color: accent }}>
          {page} / {totalPages}
        </span>
      </div>
    </div>
  );
}
