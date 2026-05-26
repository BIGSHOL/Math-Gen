// ProblemMeta.tsx
// 문항 번호 + 메타(단원/난이도) + 점수 라벨. 템플릿 별로 스타일 다름.
//
// design_handoff/src/ProblemMeta.tsx 그대로 — import path 만 ../tokens / ../types.

import React from "react";
import { PAPER_COLORS, PAPER_FONTS } from "../tokens";
import type { PrintTemplate } from "../types";

interface QuestionNumberProps {
  template: PrintTemplate;
  num: number;
  accent: string;
}

export function QuestionNumber({ template, num, accent }: QuestionNumberProps) {
  const printStyle: React.CSSProperties = {
    WebkitPrintColorAdjust: "exact" as const,
  };

  switch (template) {
    case "pyeongga":
      // 평가원 — 두꺼운 본문 글자 번호 + 마침표
      return (
        <span
          style={{
            fontWeight: 800,
            fontFamily: PAPER_FONTS.serifKR,
            fontSize: 14,
            marginRight: 6,
            ...printStyle,
          }}
        >
          {num}.
        </span>
      );

    case "jeongtong":
      // 정통 — 단순 번호 + 마침표 (큰 글자)
      return (
        <span
          style={{
            fontWeight: 800,
            fontFamily: PAPER_FONTS.serifKR,
            fontSize: 14,
            marginRight: 6,
            ...printStyle,
          }}
        >
          {num}.
        </span>
      );

    case "modern":
      // 모던 — 큰 sans-serif 번호, accent 색, zero-pad
      return (
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: accent,
            fontFamily: PAPER_FONTS.sansKR,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
            ...printStyle,
          }}
        >
          {String(num).padStart(2, "0")}.
        </span>
      );

    case "workbook":
      // 워크북 — 채워진 박스
      return (
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 22,
            height: 22,
            background: accent,
            color: "white",
            fontWeight: 700,
            fontSize: 12,
            marginRight: 6,
            verticalAlign: "middle",
            ...printStyle,
          }}
        >
          {num}
        </span>
      );

    case "jaseup":
      // 자습 — "문 N" 큰 serif
      return (
        <span
          style={{
            fontFamily: PAPER_FONTS.serifKR,
            fontWeight: 800,
            fontSize: 18,
            color: accent,
            marginRight: 8,
            lineHeight: 1,
            ...printStyle,
          }}
        >
          문 {num}
        </span>
      );

    case "yuhyung":
      // 유형 — 외곽선 박스
      return (
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 22,
            height: 22,
            border: `1.5px solid ${accent}`,
            fontWeight: 700,
            fontSize: 12,
            marginRight: 6,
            verticalAlign: "middle",
            color: accent,
            ...printStyle,
          }}
        >
          {num}
        </span>
      );

    default:
      return <span style={{ fontWeight: 700, marginRight: 6 }}>{num}.</span>;
  }
}

interface PointsLabelProps {
  points: number;
  style?: React.CSSProperties;
}

export function PointsLabel({ points, style }: PointsLabelProps) {
  return (
    <span
      style={{
        fontFamily: PAPER_FONTS.serifKR,
        fontSize: 11,
        color: PAPER_COLORS.ink70,
        marginLeft: 6,
        ...style,
      }}
    >
      [{points}점]
    </span>
  );
}

interface TopicLabelProps {
  topic: string;
  accent?: string;
}

/** 단원명 — 모던/워크북에서 사용. */
export function TopicLabel({ topic, accent }: TopicLabelProps) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: accent ?? PAPER_COLORS.ink50,
        fontFamily: PAPER_FONTS.sansKR,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {topic}
    </span>
  );
}
