import { useMemo } from "react";
import { Card, Eyebrow, Icon } from "@app/components/ui";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
} from "@app/lib/examAnalysisHelpers";
import type { AnalyzedQuestion, DifficultyBand } from "@app/types/examAnalysis";

/**
 * 서술형 문항 집중 분석 (Phase N+1).
 *
 * mathlab `D:\mathlab\src\components\exam-analysis\EssayAnalysisSection.tsx`
 * carry-over — mathg-gen Card / Eyebrow / Icon 톤 + amber 시각 코딩 유지.
 *
 * 데이터: questions[*].question_format === "essay" 필터 → 통계 derived.
 * - 4 통계 카드 (문항 수 / 총 배점 / 평균 난이도 / 문항당 배점)
 * - 난이도 분포 막대 (서술형 한정)
 * - 단원별 출제 현황 리스트
 * - 하단 안내문 (배점 비중에 따라 "높은/적절한/낮은" 자동 분기)
 */
export interface EssayAnalysisSectionProps {
  questions: AnalyzedQuestion[];
  totalQuestions: number;
  totalPoints: number;
}

const DIFFICULTY_ORDER: readonly DifficultyBand[] = ["1", "2", "3", "4", "5"];

export const EssayAnalysisSection = ({
  questions,
  totalQuestions,
  totalPoints,
}: EssayAnalysisSectionProps) => {
  // 서술형 필터
  const essayQuestions = useMemo(
    () => questions.filter((q) => q.question_format === "essay"),
    [questions],
  );

  // 기본 통계
  const stats = useMemo(() => {
    const count = essayQuestions.length;
    const pts = essayQuestions.reduce((s, q) => s + (q.points || 0), 0);
    const avgPtsPerQ = count > 0 ? pts / count : 0;

    // 평균 난이도 — 1~5 가중평균 후 인접 단계로 매핑
    const avgDiffLevel =
      count > 0
        ? essayQuestions.reduce(
            (s, q) => s + Number(q.difficulty || "3"),
            0,
          ) / count
        : 0;
    const avgDiffKey: DifficultyBand =
      avgDiffLevel >= 4.5
        ? "5"
        : avgDiffLevel >= 3.5
          ? "4"
          : avgDiffLevel >= 2.5
            ? "3"
            : avgDiffLevel >= 1.5
              ? "2"
              : "1";

    return {
      count,
      countPct:
        totalQuestions > 0 ? Math.round((count / totalQuestions) * 100) : 0,
      totalPts: pts,
      ptsPct: totalPoints > 0 ? Math.round((pts / totalPoints) * 100) : 0,
      avgDiffLabel: DIFFICULTY_LABELS[avgDiffKey],
      avgDiffKey,
      avgPtsPerQ: avgPtsPerQ.toFixed(1),
    };
  }, [essayQuestions, totalQuestions, totalPoints]);

  // 난이도 분포 (서술형 한정)
  const diffDistribution = useMemo(() => {
    const counts: Record<DifficultyBand, number> = {
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
    };
    for (const q of essayQuestions) {
      const d = (q.difficulty || "3") as DifficultyBand;
      counts[d] = (counts[d] || 0) + 1;
    }
    const total = essayQuestions.length || 1;
    return DIFFICULTY_ORDER.map((key) => ({
      key,
      label: DIFFICULTY_LABELS[key],
      count: counts[key],
      pct: Math.round((counts[key] / total) * 100),
      color: DIFFICULTY_COLORS[key],
    })).filter((d) => d.count > 0);
  }, [essayQuestions]);

  // 단원별 출제 현황 — 마지막 소단원 이름만
  const topicList = useMemo(() => {
    const map = new Map<string, { count: number; pts: number }>();
    for (const q of essayQuestions) {
      const topic = q.topic || "미분류";
      const shortTopic = topic.split(" > ").pop() || topic;
      const existing = map.get(shortTopic) || { count: 0, pts: 0 };
      existing.count++;
      existing.pts += q.points || 0;
      map.set(shortTopic, existing);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [essayQuestions]);

  if (essayQuestions.length === 0) return null;

  const maxDiff = Math.max(...diffDistribution.map((d) => d.count), 1);
  const weightLabel =
    stats.ptsPct >= 30 ? "높은" : stats.ptsPct >= 15 ? "적절한" : "낮은";

  return (
    <Card className="overflow-hidden">
      {/* 헤더 — 서술형 amber 시각 코딩 */}
      <div className="flex items-center justify-between mb-3">
        <Eyebrow icon="file-text" className="text-warn">
          서술형 문항 집중 분석
        </Eyebrow>
        <span className="inline-flex items-center px-2.5 py-1 rounded-r2 bg-warn-soft text-warn text-caption font-semibold">
          배점 가중치 {stats.ptsPct}%
        </span>
      </div>

      {/* 4 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="문항 수"
          value={`${stats.count}문항`}
          sub={`전체의 ${stats.countPct}%`}
        />
        <StatCard
          label="총 배점"
          value={`${stats.totalPts}점`}
          sub={`전체의 ${stats.ptsPct}%`}
        />
        <StatCard
          label="평균 난이도"
          value={stats.avgDiffLabel}
          sub="5단계 기준"
          valueColor={DIFFICULTY_COLORS[stats.avgDiffKey]}
        />
        <StatCard
          label="문항당 배점"
          value={`${stats.avgPtsPerQ}점`}
          sub="평균"
        />
      </div>

      {/* 2 컬럼 — 난이도 분포 + 단원별 출제 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 난이도 분포 */}
        <div className="bg-surface2/40 rounded-r2 p-3.5">
          <h4 className="text-caption font-semibold text-warn mb-3">
            난이도 분포
          </h4>
          <div className="space-y-2.5">
            {diffDistribution.map((d) => (
              <div key={d.key} className="flex items-center gap-2.5">
                <span className="w-12 text-caption text-text2 shrink-0">
                  {d.label}
                </span>
                <div className="flex-1 bg-surface3 rounded-r1 h-5 overflow-hidden">
                  <div
                    className="h-full rounded-r1 flex items-center justify-end pr-2 text-white text-[10px] font-bold transition-all"
                    style={{
                      width: `${Math.max((d.count / maxDiff) * 100, 18)}%`,
                      backgroundColor: d.color,
                    }}
                  >
                    {d.count}
                  </div>
                </div>
                <span className="w-10 text-right text-caption text-muted font-mono shrink-0">
                  {d.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 단원별 출제 현황 */}
        <div className="bg-surface2/40 rounded-r2 p-3.5">
          <h4 className="text-caption font-semibold text-warn mb-3">
            단원별 출제 현황
          </h4>
          {topicList.length > 0 ? (
            <div className="space-y-2">
              {topicList.map((t, i) => (
                <div key={t.name} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-warn-soft text-warn text-[10px] font-bold grid place-items-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-caption text-text2 truncate">
                    {t.name}
                  </span>
                  <span className="text-[10px] text-muted shrink-0">
                    {t.count}문항
                  </span>
                  <span className="text-[10px] text-muted w-10 text-right font-mono shrink-0">
                    {t.pts}점
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-caption text-muted text-center py-3">
              단원 정보 없음
            </p>
          )}
        </div>
      </div>

      {/* 하단 안내문 */}
      <div className="mt-4 px-3.5 py-2.5 rounded-r2 bg-warn-soft border border-warn/20 flex items-start gap-2">
        <Icon name="info" size={14} className="text-warn mt-0.5 shrink-0" />
        <p className="text-caption text-warn leading-relaxed">
          서술형 문항은 배점이 높고 변별력이 큰 문항입니다. 전체 배점의{" "}
          {stats.ptsPct}% 로 {weightLabel} 비중을 차지하고 있습니다.
        </p>
      </div>
    </Card>
  );
};

// ── 통계 카드 ──

const StatCard = ({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor?: string;
}) => (
  <div className="bg-surface rounded-r2 p-3 text-center border border-line">
    <p className="text-caption font-medium text-muted mb-1">{label}</p>
    <p
      className="text-base font-bold text-text font-mono"
      style={valueColor ? { color: valueColor } : undefined}
    >
      {value}
    </p>
    <p className="text-[10px] text-muted mt-0.5">{sub}</p>
  </div>
);

export default EssayAnalysisSection;
