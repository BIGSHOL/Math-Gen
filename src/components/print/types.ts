// types.ts
// 인쇄 6 신규 template 의 공통 타입. design_handoff/src/PrintTemplate.types.ts
// 의 PrintMeta + PrintTemplateProps 를 Mathgen 의 ProblemReview / PrintOptions
// 와 결합.
//
// PrintTemplate union 은 *여기가 source of truth*. wizardStore.ts 가 이걸
// re-export — 사이클 회피 (이 파일은 wizardStore 의 type 만 import).

import type { ProblemReview, PrintOptions } from "@app/stores/wizardStore";

/** 6 신규 인쇄 템플릿. */
export type PrintTemplate =
  | "pyeongga" // 평가원 정밀형 — 수능·모의평가 클론
  | "jeongtong" // 정통 내신형 — 학교 시험지 표 양식
  | "modern" // 모던 내신형 — 학교 마케팅
  | "workbook" // 학원 워크북 — 풀이공간 포함
  | "jaseup" // 자습 학습지 — 개념박스 + 모눈
  | "yuhyung"; // 유형 훈련지 — 같은 유형 반복 컴팩트

/** 시험지 메타데이터. 헤더 / 푸터 / 워터마크 등에서 사용. */
export interface PrintMeta {
  /** 시험지 타이틀. 예: "2025학년도 1학기 중간고사" */
  title: string;
  /** 학교명. 예: "○○고등학교" */
  schoolName?: string;
  /** 학년. 예: "2학년" */
  grade?: string;
  /** 과목명. 예: "수학" */
  subject: string;
  /** 학기. 예: "1학기" */
  semester?: string;
  /** 시험 일시. */
  examDate?: string;
  /** 시험 시간. 예: "50분" */
  examDuration?: string;
  /** 출제자. */
  examiner?: string;
  /** 총점. 기본 100. */
  totalScore?: number;
  /** 워크북 학원명. */
  academyName?: string;
  /** 워크북 강사. */
  instructorName?: string;
  /** 자습 학습지 단원·개념 정리 (markdown 허용). */
  conceptNote?: string;
  /** 자습 학습지 학습 목표. */
  todayGoal?: string;
  /** 유형 훈련지 유형명. */
  patternName?: string;
  /** 유형 훈련지 핵심 전략. */
  patternStrategy?: string;
}

/** 6 신규 template 컴포넌트가 모두 받는 공통 props. */
export interface PrintTemplateProps {
  /** 페이지 번호 (1-indexed). */
  page: number;
  /** 총 페이지. */
  totalPages: number;
  /** 1단/2단. workbook/jaseup 의 1단은 풀이공간 포함. */
  columns: 1 | 2;
  /** 시험지 메타데이터. */
  meta: PrintMeta;
  /** 이 페이지에 렌더할 문항. paginateProblems() 의 결과 한 페이지분. */
  problems: ProblemReview[];
  /** 1-indexed 시작 문항 번호. 페이지 N 의 첫 문항 번호. */
  startingNumber: number;
  /** PrintOptions — accentColor / showDate / showChapter 등 헤더 토글. */
  options: PrintOptions;
}
