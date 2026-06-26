// JeongtongTemplate.tsx (T2) — 정통 내신형 (학교 시험지 표 양식)
// design_handoff 카피 + import path 조정 + ProblemBody import 교체.

import type { CSSProperties } from "react";
import type { ProblemReview } from "@app/stores/wizardStore";
import { bodyFontSize } from "@app/lib/printGeometry";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { ProblemBody } from "./ProblemBody";
import { stripLeadingProblemNumber } from "@app/lib/problemAdapter";
import type { PrintTemplateProps } from "../types";

// HWP 본문 표현에 최대한 맞춘 미리보기(사용자 결정 2026-06-23): 번호(볼드)+발문 인라인,
// [배점] 발문 끝 — testchange writer 의 _write_question 과 동일 흐름.
// 단 *도형은 그대로 렌더*(미리보기/PDF 는 완성 시험지). HWP 는 도형을 못 그려 "그림 자리"가
// 되지만, 그 차이는 PrintActionPanel 의 HWP 내보내기 안내 경고로 커버(쪽 나눔·간격·도형
// 차이 + 직접 붙여넣기 안내). 정확 미리보기(COM PDF)는 다운로드와 시간 동일·읽기전용이라 제거.
const toHwpPreview = (
  v: ProblemReview["variant"],
  num: number,
): ProblemReview["variant"] => ({
  ...v,
  // 본문 선두 자기 번호 strip 후 **num.** 부착 — "4. 4." 중복 방지(§42-8d 웹 판).
  // 배점은 ProblemBody.repositionScore 가 발문 끝에 통일(6 템플릿 공통, §45).
  question: `**${num}.** ${stripLeadingProblemNumber(v.question ?? "", v.number)}`,
});

const tdLabel = (w?: number): CSSProperties => ({
  width: w,
  padding: "6px 10px",
  background: PAPER_COLORS.ink04,
  fontWeight: 700,
  textAlign: "center",
  border: `1px solid ${PAPER_COLORS.ink}`,
  fontFamily: "var(--paper-font-serif)",
});

const tdVal = (w?: number, last?: boolean): CSSProperties => ({
  width: w,
  padding: "6px 10px",
  textAlign: "center",
  border: `1px solid ${PAPER_COLORS.ink}`,
  borderRight: last ? `1px solid ${PAPER_COLORS.ink}` : undefined,
  fontFamily: "var(--paper-font-serif)",
});

export function JeongtongTemplate({
  page,
  columns,
  meta,
  problems,
  startingNumber,
  options,
  splitIndex,
  measure,
}: PrintTemplateProps) {
  const isFirstPage = page === 1;
  const fs = bodyFontSize("jeongtong", columns);
  const gap = Math.max(0, options.spacing);

  const renderItem = (p: ProblemReview, i: number) => {
    const num = startingNumber + i;
    // HWP 출력과 동일하게: 번호+발문 인라인, [배점]은 ProblemBody 가 발문 끝에, 그림은 "그림 자리".
    const hwpProblem = toHwpPreview(p.variant, num);
    return (
      <div key={p.id} data-measure-idx={i} style={{ breakInside: "avoid" }}>
        <ProblemBody problem={hwpProblem} fontSize={fs} compact />
      </div>
    );
  };

  // 측정 모드 — 헤더/푸터/A4 chrome 없이 본문만 1단 flow, 타겟 컬럼 폭으로 렌더.
  // usePrintLayout 이 각 data-measure-idx 래퍼의 offsetHeight 를 실측한다.
  if (measure) {
    return (
      <div
        style={{
          width: measure.columnWidthPx,
          fontFamily: "var(--paper-font-serif)",
          fontSize: fs,
          lineHeight: 1.5,
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
        padding: "40px 50px 24px",
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
          {/* 시험 정보 표 */}
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: `2.5px solid ${PAPER_COLORS.ink}`,
              fontFamily: "var(--paper-font-serif)",
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            <tbody>
              <tr style={{ height: 38 }}>
                <td
                  colSpan={6}
                  style={{
                    textAlign: "center",
                    fontSize: 22,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    padding: "6px 12px",
                    borderBottom: `1.5px solid ${PAPER_COLORS.ink}`,
                  }}
                >
                  {meta.title}
                </td>
              </tr>
              <tr style={{ height: 32 }}>
                <td style={tdLabel(80)}>학 교</td>
                <td style={tdVal()}>{meta.schoolName ?? "○○고등학교"}</td>
                <td style={tdLabel(60)}>학 년</td>
                <td style={tdVal(50)}>{meta.grade ?? "2"}</td>
                <td style={tdLabel(70)}>과 목</td>
                <td style={tdVal(undefined, true)}>{meta.subject}</td>
              </tr>
              <tr style={{ height: 32 }}>
                <td style={tdLabel()}>일 시</td>
                <td style={tdVal()}>{meta.examDate ?? "—"}</td>
                <td style={tdLabel()}>시 간</td>
                <td style={tdVal()}>{meta.examDuration ?? "50분"}</td>
                <td style={tdLabel()}>출제</td>
                <td style={tdVal(undefined, true)}>{meta.examiner ?? "—"}</td>
              </tr>
            </tbody>
          </table>

          {/* 학생 정보 + 점수 표 */}
          <div
            style={{
              display: "flex",
              marginTop: 8,
              gap: 8,
              flexShrink: 0,
            }}
          >
            <table
              style={{
                flex: 1,
                borderCollapse: "collapse",
                border: `2px solid ${PAPER_COLORS.ink}`,
                fontSize: 12,
                fontFamily: "var(--paper-font-serif)",
              }}
            >
              <tbody>
                <tr style={{ height: 34 }}>
                  <td style={tdLabel(45)}>학년</td>
                  <td style={tdVal(55)}></td>
                  <td style={tdLabel(45)}>반</td>
                  <td style={tdVal(55)}></td>
                  <td style={tdLabel(45)}>번호</td>
                  <td style={tdVal(55)}></td>
                  <td style={tdLabel(45)}>이름</td>
                  <td style={tdVal(undefined, true)}></td>
                </tr>
              </tbody>
            </table>
            <table
              style={{
                width: 140,
                borderCollapse: "collapse",
                border: `2px solid ${PAPER_COLORS.ink}`,
                fontSize: 12,
                fontFamily: "var(--paper-font-serif)",
              }}
            >
              <tbody>
                <tr style={{ height: 34 }}>
                  <td
                    style={{
                      ...tdLabel(58),
                      background: PAPER_COLORS.ink04,
                    }}
                  >
                    점 수
                  </td>
                  <td
                    style={{
                      ...tdVal(undefined, true),
                      textAlign: "right",
                      paddingRight: 10,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: PAPER_COLORS.ink30 }}>
                      /{meta.totalScore ?? 100}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 유의사항 */}
          <div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              border: `1px solid ${PAPER_COLORS.ink70}`,
              fontSize: 10.5,
              lineHeight: 1.55,
              color: PAPER_COLORS.ink70,
              fontFamily: "var(--paper-font-serif)",
              flexShrink: 0,
            }}
          >
            ※ 답안은 OMR 카드에 컴퓨터용 사인펜으로 표기하시오. 한 문항에 두 개 이상 표기한 경우 0점 처리합니다.
          </div>
        </>
      )}

      {/* 본문 */}
      <BodyContainer
        columns={columns}
        gap={gap}
        splitIndex={splitIndex}
        distribute={options.layoutMode === "count"}
        style={{
          marginTop: isFirstPage ? 18 : 0,
          marginBottom: 8,
          fontSize: fs,
          lineHeight: 1.5,
          fontFamily: "var(--paper-font-serif)",
        }}
      >
        {problems.map(renderItem)}
      </BodyContainer>

      {/* 푸터 */}
      <div
        style={{
          textAlign: "center",
          fontSize: 11,
          fontFamily: "var(--paper-font-serif)",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        - {page} -
      </div>
    </div>
  );
}
