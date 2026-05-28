import { useMemo } from "react";
import { Card, Eyebrow } from "@app/components/ui";
import type { AnalyzedQuestion, DifficultyBand } from "@app/types/examAnalysis";

/**
 * 변별력 분석 (Phase N+1).
 *
 * mathlab `D:\mathlab\src\components\exam-analysis\DiscriminationSection.tsx`
 * carry-over. 모든 점수/등급은 *클라이언트 derived* — schema 변경 X.
 *
 * 계산 공식 (calculateDiscriminationScore):
 *   base = (points × 난이도배중[1-5]) / 10 × 100
 *   서술형 +20%
 *   저난이도+고배점 ×0.7 패널티
 *   고난이도+적정배점 ×1.15 보너스
 *
 * 등급: 80+ 우수 / 60-79 양호 / 40-59 보통 / <40 주의
 */
export interface DiscriminationSectionProps {
  questions: AnalyzedQuestion[];
}

// ── 변별력 등급 정의 — mathlab 동일 색상 + 멘트 ──

const DISCRIMINATION_GRADES = {
  excellent: {
    label: "우수",
    color: "#22C55E",
    bgColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    description: "적절한 난이도와 높은 배점으로 실력 차이가 잘 드러납니다",
  },
  good: {
    label: "양호",
    color: "#3B82F6",
    bgColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    description: "적절한 난이도로 실력을 잘 평가할 수 있습니다",
  },
  fair: {
    label: "보통",
    color: "#F59E0B",
    bgColor: "#FFFBEB",
    borderColor: "#FDE68A",
    description: "배점이 낮아 점수 차이에 큰 영향이 없습니다",
  },
  poor: {
    label: "주의",
    color: "#EF4444",
    bgColor: "#FEF2F2",
    borderColor: "#FECACA",
    description: "쉬운 문항으로 실력 차이가 잘 드러나지 않습니다",
  },
} as const;

type DiscriminationGrade = keyof typeof DISCRIMINATION_GRADES;

// ── 변별력 점수 계산 ──

const DIFFICULTY_WEIGHT: Record<DifficultyBand, number> = {
  "1": 0.3,
  "2": 0.5,
  "3": 0.65,
  "4": 0.8,
  "5": 1.0,
};

const calculateDiscriminationScore = (q: AnalyzedQuestion): number => {
  const points = q.points || 3;
  const diff = (q.difficulty || "1") as DifficultyBand;
  const mult = DIFFICULTY_WEIGHT[diff] || 0.5;

  let base = ((points * mult) / 10) * 100;

  // 서술형 보너스
  if (q.question_format === "essay") base *= 1.2;

  // 낮은 난이도 + 높은 배점 → 변별력 ↓
  if ((diff === "1" || diff === "2") && points >= 5) base *= 0.7;

  // 높은 난이도 + 적절 배점 → 변별력 ↑
  if ((diff === "4" || diff === "5") && points >= 4) base *= 1.15;

  return Math.min(100, Math.max(0, Math.round(base)));
};

const getGrade = (score: number): DiscriminationGrade => {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "poor";
};

const getOverallGrade = (
  avgScore: number,
): { grade: DiscriminationGrade; label: string } => {
  if (avgScore >= 80) return { grade: "excellent", label: "우수" };
  if (avgScore >= 60) return { grade: "good", label: "양호" };
  if (avgScore >= 40) return { grade: "fair", label: "보통" };
  return { grade: "poor", label: "주의" };
};

// ── 메인 컴포넌트 ──

export const DiscriminationSection = ({
  questions,
}: DiscriminationSectionProps) => {
  const scoredQuestions = useMemo(
    () =>
      questions.map((q) => {
        const score = calculateDiscriminationScore(q);
        return { ...q, discriminationScore: score, grade: getGrade(score) };
      }),
    [questions],
  );

  const avgScore = useMemo(() => {
    if (scoredQuestions.length === 0) return 0;
    return Math.round(
      scoredQuestions.reduce((s, q) => s + q.discriminationScore, 0) /
        scoredQuestions.length,
    );
  }, [scoredQuestions]);

  const gradeCounts = useMemo(() => {
    const counts: Record<DiscriminationGrade, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
    };
    for (const q of scoredQuestions) counts[q.grade]++;
    const total = scoredQuestions.length || 1;
    return (
      ["excellent", "good", "fair", "poor"] as DiscriminationGrade[]
    ).map((grade) => ({
      grade,
      ...DISCRIMINATION_GRADES[grade],
      count: counts[grade],
      pct: Math.round((counts[grade] / total) * 100),
    }));
  }, [scoredQuestions]);

  const sorted = useMemo(
    () =>
      [...scoredQuestions].sort(
        (a, b) => b.discriminationScore - a.discriminationScore,
      ),
    [scoredQuestions],
  );
  const top5 = sorted.slice(0, 5);
  const bottom5 = [...sorted].reverse().slice(0, 5);

  const overall = getOverallGrade(avgScore);
  const overallInfo = DISCRIMINATION_GRADES[overall.grade];

  if (questions.length === 0) return null;

  return (
    <Card>
      <Eyebrow icon="chart-line">변별력 분석</Eyebrow>
      <p className="text-caption text-muted mt-1 mb-4">
        시험 문항이 실력을 얼마나 정확하게 반영하는지 평가합니다
      </p>

      {/* 요약 배너 */}
      <div
        className="rounded-r2 p-4 border mb-4"
        style={{
          backgroundColor: overallInfo.bgColor,
          borderColor: overallInfo.borderColor,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-r1 text-small font-bold text-white"
            style={{ backgroundColor: overallInfo.color }}
          >
            {overall.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-small font-semibold text-text">
              평균 변별력 지수:{" "}
              <span style={{ color: overallInfo.color }} className="font-mono">
                {avgScore}점
              </span>
            </p>
            <p className="text-caption text-text2 mt-0.5">
              {overallInfo.description}
            </p>
          </div>
        </div>
      </div>

      {/* 4 등급 카드 — 한 행 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {gradeCounts.map((gc) => (
          <div
            key={gc.grade}
            className="rounded-r2 px-3 py-2 flex items-center gap-2"
            style={{ backgroundColor: gc.bgColor }}
          >
            <span
              className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold text-white shrink-0"
              style={{ backgroundColor: gc.color }}
            >
              {gc.label}
            </span>
            <span className="text-small font-bold text-text font-mono">
              {gc.count}
              <span className="text-caption font-normal text-muted ml-0.5">
                문항
              </span>
            </span>
            <span className="text-[10px] text-muted ml-auto font-mono">
              {gc.pct}%
            </span>
          </div>
        ))}
      </div>

      {/* 2 컬럼 — 상위 5 / 하위 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DiscriminationColumn
          stripeColor="#22C55E"
          title="실력을 잘 반영하는 문항 (상위 5개)"
          items={top5}
        />
        <DiscriminationColumn
          stripeColor="#EF4444"
          title="점수 차이가 나기 어려운 문항 (하위 5개)"
          items={bottom5}
        />
      </div>
    </Card>
  );
};

// ── 컬럼 + 문항 카드 ──

interface ScoredQuestion extends AnalyzedQuestion {
  discriminationScore: number;
  grade: DiscriminationGrade;
}

const DiscriminationColumn = ({
  stripeColor,
  title,
  items,
}: {
  stripeColor: string;
  title: string;
  items: ScoredQuestion[];
}) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <span
        className="w-1 h-4 rounded-full"
        style={{ backgroundColor: stripeColor }}
      />
      <h4 className="text-caption font-semibold text-text2">{title}</h4>
    </div>
    <div className="space-y-2">
      {items.map((q) => (
        <QuestionDiscriminationCard key={String(q.question_number)} q={q} />
      ))}
    </div>
  </div>
);

const QuestionDiscriminationCard = ({ q }: { q: ScoredQuestion }) => {
  const gradeInfo = DISCRIMINATION_GRADES[q.grade];
  return (
    <div className="px-3 py-3 bg-surface2/40 rounded-r2 border border-line">
      <div className="flex items-center justify-between mb-1">
        <span className="text-small font-bold text-text whitespace-nowrap">
          {q.question_number}번
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-caption text-muted font-mono">
            {q.points || 0}점
          </span>
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-bold text-white"
            style={{ backgroundColor: gradeInfo.color }}
          >
            {gradeInfo.label}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-muted">{gradeInfo.description}</p>
    </div>
  );
};

export default DiscriminationSection;
