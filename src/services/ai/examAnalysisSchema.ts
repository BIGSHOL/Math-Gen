/**
 * 시험지 분석 (Phase N) — Anthropic tool_use JSON Schema.
 *
 * mathlab `types.ts:9-83` 의 BasicAnalysisResult shape 와 *완전 동일*.
 * Anthropic SDK 의 strict tool_use 사용 — 모든 키 required +
 * `additionalProperties: false` (CLAUDE.md §4-5).
 *
 * student 전용 4필드 (is_correct / student_answer / earned_points / error_type)
 * 는 *제거* — Phase N 은 blank paper only.
 */

import type Anthropic from "@anthropic-ai/sdk";

/**
 * 한 문항 — 10필드. mathlab AnalyzedQuestion 의 student 4 제외.
 *
 * H2~H4 enum 강제 (난이도/유형/사고력).
 */
const ANALYZED_QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question_number: {
      type: ["number", "string"],
      description:
        '시험지에 표기된 번호. 객관식·단답형은 정수, 서술형은 "서술형1" 같은 문자열 가능',
    },
    question_format: {
      type: ["string", "null"],
      enum: ["objective", "short_answer", "essay", null],
      description: "문항 형식. 판단 불가 시 null",
    },
    difficulty: {
      type: "string",
      enum: ["1", "2", "3", "4", "5"],
      description: "5단계 난이도 — H2 강제 (문자열)",
    },
    difficulty_reason: {
      type: ["string", "null"],
      description:
        '난이도 판정 이유 (최대 15자). 예: "3단계 풀이" / "함정 변형"',
    },
    question_type: {
      type: "string",
      enum: ["number", "algebra", "function", "geometry", "statistics"],
      description: "5개 수학 영역 — H3 강제",
    },
    ability_domain: {
      type: ["string", "null"],
      enum: [
        "calculation",
        "understanding",
        "reasoning",
        "problem_solving",
        null,
      ],
      description:
        "4개 사고력 영역 — H4 강제. 풀이에 요구되는 능력 기준 (소문자)",
    },
    points: {
      type: ["number", "null"],
      description: "배점. 불분명 시 null",
    },
    topic: {
      type: ["string", "null"],
      description:
        '"과목명 > 대단원 > 소단원" (공백 포함 > 구분). 예: "중3 수학 > 이차방정식 > 이차방정식의 풀이"',
    },
    ai_comment: {
      type: ["string", "null"],
      description:
        "정확히 2문장, 존댓말, 각 20~40자. 1문장=출제 의도, 2문장=풀이 포인트",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "0.0~1.0 — H15 5단계 매핑 + H17 분포 강제",
    },
    confidence_reason: {
      type: ["string", "null"],
      enum: [
        "문항 내용 명확",
        "비정형 유형",
        "배점 추정",
        "출제범위 의심",
        "스캔 품질 낮음",
        "판독 실패 — 번호만 인식",
        null,
      ],
      description: "신뢰도 판정 근거 — H16 매핑 강제",
    },
  },
  required: [
    "question_number",
    "question_format",
    "difficulty",
    "difficulty_reason",
    "question_type",
    "ability_domain",
    "points",
    "topic",
    "ai_comment",
    "confidence",
    "confidence_reason",
  ],
} as const;

/** 난이도 분포 — 합계 = total_questions */
const DIFFICULTY_DISTRIBUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    "1": { type: "number" },
    "2": { type: "number" },
    "3": { type: "number" },
    "4": { type: "number" },
    "5": { type: "number" },
  },
  required: ["1", "2", "3", "4", "5"],
} as const;

/** 영역 분포 — 5개 수학 영역 */
const TYPE_DISTRIBUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    number: { type: "number" },
    algebra: { type: "number" },
    function: { type: "number" },
    geometry: { type: "number" },
    statistics: { type: "number" },
  },
  required: ["number", "algebra", "function", "geometry", "statistics"],
} as const;

/** 사고력 분포 — 4개 영역 (UI 레이더 차트 source). 후처리에서 재계산. */
const DOMAIN_DISTRIBUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    calculation: { type: "number" },
    understanding: { type: "number" },
    reasoning: { type: "number" },
    problem_solving: { type: "number" },
  },
  required: ["calculation", "understanding", "reasoning", "problem_solving"],
} as const;

/** 문항 형식 분포 */
const FORMAT_DISTRIBUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    objective: { type: "number" },
    short_answer: { type: "number" },
    essay: { type: "number" },
  },
  required: ["objective", "short_answer", "essay"],
} as const;

/** 분석 요약 */
const ANALYSIS_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    difficulty_distribution: DIFFICULTY_DISTRIBUTION_SCHEMA,
    type_distribution: TYPE_DISTRIBUTION_SCHEMA,
    domain_distribution: DOMAIN_DISTRIBUTION_SCHEMA,
    average_difficulty: {
      type: "string",
      enum: ["1", "2", "3", "4", "5"],
    },
    dominant_type: {
      type: "string",
      enum: ["number", "algebra", "function", "geometry", "statistics"],
    },
  },
  required: [
    "difficulty_distribution",
    "type_distribution",
    "domain_distribution",
    "average_difficulty",
    "dominant_type",
  ],
} as const;

/** 시험지 메타 정보 */
const EXAM_INFO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    total_questions: { type: "number" },
    total_points: { type: "number" },
    school_name: { type: ["string", "null"] },
    format_distribution: FORMAT_DISTRIBUTION_SCHEMA,
  },
  required: [
    "total_questions",
    "total_points",
    "school_name",
    "format_distribution",
  ],
} as const;

/** BasicAnalysisResult — 최상위 분석 결과 schema */
export const EXAM_ANALYSIS_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    exam_info: EXAM_INFO_SCHEMA,
    summary: ANALYSIS_SUMMARY_SCHEMA,
    questions: {
      type: "array",
      items: ANALYZED_QUESTION_SCHEMA,
    },
  },
  required: ["exam_info", "summary", "questions"],
} as const;

/**
 * Anthropic tool_use 정의 — `messages.create` 의 `tools` 배열에 직접 전달.
 *
 * `input_schema` 가 위 BasicAnalysisResult schema. 모델이 이 schema 에 정확히
 * 맞춰 emit 하도록 강제. tool_choice 도 강제 (`{ type: "tool", name: ... }`).
 */
export const EXAM_ANALYSIS_TOOL: Anthropic.Messages.Tool = {
  name: "emit_exam_analysis",
  description:
    "시험지 분석 결과를 emit. 모든 문항 분석 + 요약 통계 + 시험지 메타 정보를 포함한 BasicAnalysisResult JSON.",
  input_schema: EXAM_ANALYSIS_RESULT_SCHEMA as unknown as Anthropic.Messages.Tool["input_schema"],
};

/** tool_choice — Anthropic 이 *반드시* 이 도구 호출하도록. */
export const EXAM_ANALYSIS_TOOL_CHOICE: Anthropic.Messages.ToolChoice = {
  type: "tool",
  name: "emit_exam_analysis",
};
