/**
 * Centralized type surface.
 *
 * Re-exports the legacy enums/interfaces that the curriculum-based problem
 * generator depends on (kept verbatim during Phase 0.6 migration), plus the
 * new SaaS-level types introduced by the design handoff (TestPaper, OCR,
 * variant history, etc.).
 */

// ---------- Legacy (kept for compatibility during Phase 0–2) ----------

export enum SchoolLevel {
  ELEMENTARY = "초등학교",
  MIDDLE = "중학교",
  HIGH = "고등학교",
}

export enum Difficulty {
  LOW = "하",
  MEDIUM = "중",
  HIGH = "상",
  EXTREME = "최상",
}

export enum ProblemType {
  CONCEPT = "개념 확인",
  TYPE = "유형 익히기",
  SKILL = "실력 다지기",
  CREATIVE = "창의 융합",
}

export enum AnswerType {
  MULTIPLE_CHOICE = "객관식 (5지선다)",
  SUBJECTIVE = "주관식/서술형",
}

export interface CurriculumUnit {
  name: string;
  subUnits?: CurriculumUnit[];
}

export interface GeneratedProblem {
  question: string;
  choices?: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  /** 배점. 기본 3 (template 별 default). 인쇄 6 신규 template 의 PointsLabel 에서 사용. */
  points?: number;
  /** @deprecated Phase E 이후 — `diagramParams` 우선. supabase JSONB 의 기존 데이터 호환용. */
  diagramSVG?: string | null;
  /**
   * Vector 도형 spec (Phase E). AI 가 emit → `normalizeDiagram` 보정 →
   * `renderDiagram` 으로 SVG 생성. 본문의 `[그림1]`, `[그림2]` 마커 순서와 매핑.
   * 도형 없으면 null/undefined.
   */
  diagramParams?: import("@app/lib/diagram").DiagramParams[] | null;
}

export type GenerationMode = "curriculum" | "image" | "exact" | "diagram";

export interface SelectionState {
  mode: GenerationMode;
  sourceImage?: string | null;
  schoolLevel: SchoolLevel;
  grade: string;
  mainUnit: string;
  subUnit: string;
  detailUnit: string;
  difficulty: Difficulty;
  problemType: ProblemType;
  answerType: AnswerType;
  removeScore?: boolean;
}

// ---------- New SaaS-level types (design handoff) ----------

export type TestStatus = "ok" | "warn" | "draft";

export interface TopicSlice {
  topic: string;
  count: number;
  /** 0–100, optional accuracy for color-coded progress bars. */
  accuracy?: number;
}

export interface VariantHistory {
  id: string;
  createdAt: string; // ISO
  intensity: 0 | 1 | 2;
  count: number;
  /** Optional summary string shown on the variant card. */
  label?: string;
}

export interface TestPaper {
  id: string;
  title: string;
  problemCount: number;
  status: TestStatus;
  statusText: string;
  /** e.g. "오늘", "어제", "3일 전" — display only. */
  time: string;
  /** e.g. "공통+미적분". */
  subject: string;
  tags: string[];
  grade: string;
  topicDistribution: TopicSlice[];
  variants: VariantHistory[];
  /** Problems on this test paper (after OCR digitization). */
  problems: GeneratedProblem[];
}
