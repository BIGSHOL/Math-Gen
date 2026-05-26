// JeongtongTemplate.tsx (T2) — 정통 내신형 (학교 시험지 표 양식)
// design_handoff 카피 + import path 조정 + ProblemBody import 교체.

import type { CSSProperties } from "react";
import { PAPER_COLORS, A4_DIM } from "../tokens";
import { BodyContainer } from "./BodyContainer";
import { QuestionNumber, PointsLabel } from "./ProblemMeta";
import { ProblemBody } from "./ProblemBody";
import type { PrintTemplateProps } from "../types";

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
}: PrintTemplateProps) {
  const isFirstPage = page === 1;

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
        gap={18}
        style={{
          marginTop: isFirstPage ? 18 : 0,
          marginBottom: 8,
          fontSize: 13.5,
          lineHeight: 1.8,
          fontFamily: "var(--paper-font-serif)",
        }}
      >
        {problems.map((p, i) => {
          const num = startingNumber + i;
          const points = p.variant.points ?? 3;
          return (
            <div key={p.id} style={{ breakInside: "avoid" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  marginBottom: 4,
                }}
              >
                <QuestionNumber
                  template="jeongtong"
                  num={num}
                  accent={PAPER_COLORS.ink}
                />
                <span style={{ flex: 1 }} />
                <PointsLabel points={points} />
              </div>
              <ProblemBody problem={p.variant} fontSize={13.5} />
            </div>
          );
        })}
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
