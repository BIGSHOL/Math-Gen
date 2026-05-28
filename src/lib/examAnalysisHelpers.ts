/**
 * 시험지 분석 화면용 헬퍼 (Phase N+1).
 *
 * mathlab `D:\mathlab\src\app\(teacher)\exam-analysis\helpers.tsx` carry-over.
 * mathg-gen 의 *순수 5단계 schema* 기준이라 legacy 매핑 (concept/pattern/...) 제거.
 *
 * 4 함수:
 *  - getOverallDifficultyLevel(summary) — 5단계 가중평균 (Level 1.0 ~ 5.0)
 *  - getDifficultyBreakdown(summary) — 단계별 카운트 + 총수 + 가중평균 (툴팁용)
 *  - getConfidenceInfo(questions) — 신뢰도 평균 + 색 범례 정보
 *  - interpolateDifficultyColor(level) — 가중평균을 인접 두 단계 색으로 보간
 */

import type {
  AnalysisSummary,
  AnalyzedQuestion,
  DifficultyBand,
} from "@app/types/examAnalysis";

// ════════════════════════════════════════════════════════════════════
// §1. 색상 상수 — mathg-gen 의 DifficultyDonut 과 동일 (1=green → 5=red)
// ════════════════════════════════════════════════════════════════════

/** 5단계 난이도 색상 — DifficultyDonut.tsx 와 동일 토큰. */
export const DIFFICULTY_COLORS: Record<DifficultyBand, string> = {
  "1": "#10B981", // green-500 (기본)
  "2": "#3B82F6", // blue-500 (표준)
  "3": "#EAB308", // yellow-500 (응용)
  "4": "#F97316", // orange-500 (심화)
  "5": "#EF4444", // red-500 (킬러)
};

/** 가중평균 색상 보간용 — 1~5 인덱스 순. */
export const DIFFICULTY_BAR_COLORS: readonly string[] = [
  DIFFICULTY_COLORS["1"],
  DIFFICULTY_COLORS["2"],
  DIFFICULTY_COLORS["3"],
  DIFFICULTY_COLORS["4"],
  DIFFICULTY_COLORS["5"],
];

/** 5단계 라벨 (한국 교과서 관행). */
export const DIFFICULTY_LABELS: Record<DifficultyBand, string> = {
  "1": "1(기본)",
  "2": "2(표준)",
  "3": "3(응용)",
  "4": "4(심화)",
  "5": "5(킬러)",
};

// ════════════════════════════════════════════════════════════════════
// §1b. 유형 / 능력 라벨·색상 — mathlab constants 와 동일
// ════════════════════════════════════════════════════════════════════

/** 5 수학 영역 라벨 (한국 교육과정). */
export const QUESTION_TYPE_LABELS: Record<string, string> = {
  number: "수와 연산",
  algebra: "문자와 식",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

/** 5 수학 영역 색상. */
export const QUESTION_TYPE_COLORS: Record<string, string> = {
  number: "#6366F1", // indigo
  algebra: "#8B5CF6", // violet
  function: "#EC4899", // pink
  geometry: "#10B981", // emerald
  statistics: "#F59E0B", // amber
};

/** 4 능력 영역 라벨. */
export const ABILITY_DOMAIN_LABELS: Record<string, string> = {
  calculation: "계산력",
  understanding: "이해력",
  reasoning: "추론력",
  problem_solving: "문제해결력",
};

/** 4 능력 영역 색상. */
export const ABILITY_DOMAIN_COLORS: Record<string, string> = {
  calculation: "#3B82F6", // blue
  understanding: "#10B981", // emerald
  reasoning: "#8B5CF6", // violet
  problem_solving: "#F59E0B", // amber
};

/** 유형 → 능력 자동 매핑 (ability_domain 누락 시). */
export const TYPE_TO_DOMAIN: Record<string, string> = {
  number: "calculation",
  algebra: "calculation",
  function: "reasoning",
  geometry: "understanding",
  statistics: "problem_solving",
};

// ════════════════════════════════════════════════════════════════════
// §2. 가중평균 난이도 (Level) — 1.0 ~ 5.0
// ════════════════════════════════════════════════════════════════════

/**
 * 5단계 분포를 가중평균으로 환산.
 * 예: {1:0, 2:2, 3:9, 4:8, 5:2} → (2×2+9×3+8×4+2×5)/21 = 73/21 ≈ 3.48
 */
export const getOverallDifficultyLevel = (
  summary: AnalysisSummary | null,
): number => {
  if (!summary?.difficulty_distribution) return 0;
  const d = summary.difficulty_distribution;
  const counts = [d["1"], d["2"], d["3"], d["4"], d["5"]];
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return 0;
  return counts.reduce((s, c, i) => s + c * (i + 1), 0) / total;
};

/** Level 1.0~5.0 → 정수 반올림 (1~5). 큰 chip 표시용. */
export const getOverallDifficultyLevelRounded = (
  summary: AnalysisSummary | null,
): number => Math.round(getOverallDifficultyLevel(summary));

/** 단계별 카운트 + 총수 + 가중평균 — 툴팁/breakdown 표시용. */
export const getDifficultyBreakdown = (
  summary: AnalysisSummary | null,
): { counts: number[]; total: number; weightedAvg: number } | null => {
  if (!summary?.difficulty_distribution) return null;
  const d = summary.difficulty_distribution;
  const counts = [d["1"], d["2"], d["3"], d["4"], d["5"]];
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return null;
  const weightedAvg = counts.reduce((s, c, i) => s + c * (i + 1), 0) / total;
  return { counts, total, weightedAvg };
};

// ════════════════════════════════════════════════════════════════════
// §3. 신뢰도 평균 + 색 범례
// ════════════════════════════════════════════════════════════════════

export type ConfidenceLevel = "high" | "mid" | "low" | "none";

export interface ConfidenceInfo {
  /** 0~100 (%). */
  avg: number;
  level: ConfidenceLevel;
  label: string;
  /** Tailwind 색 토큰 (mathg-gen 디자인). */
  toneClass: string;
}

/**
 * 모든 문항의 confidence (0.0~1.0) 평균 → %. 85+ 높음 / 70-84 보통 / <70 낮음.
 * mathg-gen 의 ok / warn / danger 토큰 사용.
 */
export const getConfidenceInfo = (
  questions: AnalyzedQuestion[],
): ConfidenceInfo => {
  if (!questions.length) {
    return {
      avg: 0,
      level: "none",
      label: "없음",
      toneClass: "bg-surface2 text-muted border border-line",
    };
  }
  const avg = Math.round(
    (questions.reduce((s, q) => s + (q.confidence || 0), 0) / questions.length) *
      100,
  );
  if (avg >= 85) {
    return {
      avg,
      level: "high",
      label: "높음",
      toneClass: "bg-ok-soft text-ok border border-ok/30",
    };
  }
  if (avg >= 70) {
    return {
      avg,
      level: "mid",
      label: "보통",
      toneClass: "bg-warn-soft text-warn border border-warn/30",
    };
  }
  return {
    avg,
    level: "low",
    label: "낮음",
    toneClass: "bg-danger-soft text-danger border border-danger/30",
  };
};

// ════════════════════════════════════════════════════════════════════
// §4. 가중평균 색상 보간 — Level 2.4 = Level 2~3 중간 색
// ════════════════════════════════════════════════════════════════════

const hexToRgb = (
  hex: string,
): { r: number; g: number; b: number } | null => {
  const m = hex.trim().match(/^#?([a-f0-9]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
};

/**
 * Level 1.0~5.0 의 색상을 인접 두 단계 사이로 보간.
 * 1.0 → green / 2.5 → blue~yellow 중간 / 5.0 → red.
 */
export const interpolateDifficultyColor = (level: number): string => {
  const clamped = Math.max(1, Math.min(5, level));
  const idx = Math.floor(clamped - 1); // 0~3
  const frac = clamped - 1 - idx; // 0~1
  if (frac === 0 || idx >= DIFFICULTY_BAR_COLORS.length - 1) {
    return DIFFICULTY_BAR_COLORS[
      Math.min(idx, DIFFICULTY_BAR_COLORS.length - 1)
    ];
  }
  const from = hexToRgb(DIFFICULTY_BAR_COLORS[idx]);
  const to = hexToRgb(DIFFICULTY_BAR_COLORS[idx + 1]);
  if (!from || !to) return DIFFICULTY_BAR_COLORS[idx];
  const r = Math.round(from.r + (to.r - from.r) * frac);
  const g = Math.round(from.g + (to.g - from.g) * frac);
  const b = Math.round(from.b + (to.b - from.b) * frac);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
