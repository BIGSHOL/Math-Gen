// PrintTemplate.types.ts
// 신규 6개 인쇄 템플릿 정의. wizardStore.ts 의 PrintTemplate union 교체용.

export type PrintTemplate =
  | "pyeongga"   // 평가원 정밀형 — 수능·모의평가 클론
  | "jeongtong"  // 정통 내신형 — 학교 시험지 표 양식
  | "modern"     // 모던 내신형 — 학교 마케팅
  | "workbook"   // 학원 워크북 — 풀이공간 포함
  | "jaseup"     // 자습 학습지 — 개념박스 + 모눈
  | "yuhyung";   // 유형 훈련지 — 같은 유형 반복 컴팩트

/** 모든 신규 템플릿이 공통으로 받는 props. */
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
  /** PrintOptions 와 연동. 헤더 표시 토글 등. */
  options: PrintOptions;
}

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

export interface PrintOptions {
  template: PrintTemplate;
  columns: 1 | 2;
  /** 강조 색 (hex). */
  accentColor: string;
  /** 헤더 일자 표시. */
  showDate: boolean;
  /** 문항 단원명 표시. */
  showChapter: boolean;
  /** 난이도 라벨 표시. */
  showDifficulty: boolean;
  /** 정답지·해설지 포함 (별도 페이지). */
  showAnswers: boolean;
  /** 빠른 정답만 (해설 생략). */
  quickAnswerOnly: boolean;
  /** 문항 사이 spacing (px). */
  spacing: number;
}

/** wizardStore.ts 의 ProblemReview 형. import 가능. */
export interface ProblemReview {
  id: string;
  original: GeneratedProblem;
  variant: GeneratedProblem;
}

export interface GeneratedProblem {
  question: string;
  choices?: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  points?: number;
  diagramSVG?: string | null;
  diagramParams?: unknown[];
}

export type ExportSource = "variant" | "original" | "both";

/** 기본 PrintOptions. */
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  template: "jeongtong",
  columns: 1,
  accentColor: "#1B2A4E", // navy
  showDate: true,
  showChapter: true,
  showDifficulty: false,
  showAnswers: true,
  quickAnswerOnly: false,
  spacing: 18,
};
