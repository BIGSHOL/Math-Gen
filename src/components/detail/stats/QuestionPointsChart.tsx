import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, Eyebrow } from "@app/components/ui";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
} from "@app/lib/examAnalysisHelpers";
import type { AnalyzedQuestion, DifficultyBand } from "@app/types/examAnalysis";

/**
 * 문항별 배점 차트 (Phase N+1).
 *
 * mathlab `D:\mathlab\src\components\exam-analysis\charts\QuestionPointsChart.tsx`
 * carry-over. recharts ComposedChart — 배점 막대 + 난이도 라인 overlay.
 *
 * 추가 기능:
 *  - AI 코멘트 자동 생성 (배점 균일도 / 고배점 강조)
 *  - 배점-난이도 갭 분석 (난이도 대비 배점 높음/낮음 — 상위 5개)
 */
export interface QuestionPointsChartProps {
  questions: AnalyzedQuestion[];
}

const LINE_COLOR = "#8B5CF6"; // violet-500

export const QuestionPointsChart = ({ questions }: QuestionPointsChartProps) => {
  // 직접 width 측정 — recharts ResponsiveContainer 가 부모 폭 측정 못함 fix
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    update();
    const obs = new ResizeObserver(update);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const { chartData, maxPoints, gapItems, aiComment } = useMemo(() => {
    const sorted = [...questions].sort((a, b) => {
      const aNum =
        typeof a.question_number === "string"
          ? parseInt(a.question_number, 10)
          : a.question_number;
      const bNum =
        typeof b.question_number === "string"
          ? parseInt(b.question_number, 10)
          : b.question_number;
      return aNum - bNum;
    });

    const data = sorted.map((q, idx) => {
      const rawNum =
        typeof q.question_number === "string"
          ? parseInt(q.question_number, 10)
          : q.question_number;
      const displayName = isNaN(rawNum) ? `${idx + 1}` : `${rawNum}`;
      const diff = (q.difficulty || "1") as DifficultyBand;
      const level = Number(diff) || 1;
      return {
        name: displayName,
        points: q.points || 0,
        difficulty: diff,
        diffLevel: level,
        color: DIFFICULTY_COLORS[diff] || "#94A3B8",
        format: q.question_format || "objective",
      };
    });

    const maxPts = Math.max(...data.map((d) => d.points), 4);

    // 배점-난이도 갭 (난이도별 평균 배점 → 30% 이상 차이)
    const avgPtsPerLevel = [0, 0, 0, 0, 0, 0]; // index 0 unused, 1~5
    const countPerLevel = [0, 0, 0, 0, 0, 0];
    for (const d of data) {
      avgPtsPerLevel[d.diffLevel] += d.points;
      countPerLevel[d.diffLevel]++;
    }
    for (let i = 1; i <= 5; i++) {
      avgPtsPerLevel[i] =
        countPerLevel[i] > 0 ? avgPtsPerLevel[i] / countPerLevel[i] : 0;
    }

    const gaps = data
      .map((d) => {
        const expectedPts = avgPtsPerLevel[d.diffLevel] || 3;
        const gap = d.points - expectedPts;
        const gapRatio = expectedPts > 0 ? Math.abs(gap) / expectedPts : 0;
        return { ...d, gap, gapRatio, expectedPts };
      })
      .filter((d) => d.gapRatio > 0.3)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 5);

    // AI 코멘트 자동 생성
    const totalPts = data.reduce((s, d) => s + d.points, 0);
    const avgPts = data.length > 0 ? totalPts / data.length : 0;
    const maxItem = data.reduce(
      (max, d) => (d.points > max.points ? d : max),
      data[0],
    );
    const minItem = data.reduce(
      (min, d) => (d.points < min.points ? d : min),
      data[0],
    );
    const ptsRange = (maxItem?.points || 0) - (minItem?.points || 0);
    const highDiffLow = gaps.filter((i) => i.gap <= 0);
    const lowDiffHigh = gaps.filter((i) => i.gap > 0);

    let comment = "";
    if (ptsRange <= 2) {
      comment = `문항당 평균 ${avgPts.toFixed(1)}점으로 배점이 균일하게 분포되어 한 문항의 실수가 미치는 영향이 일정합니다.`;
    } else if (maxItem && maxItem.points >= avgPts * 2) {
      comment = `${maxItem.name}번 문항(${maxItem.points}점)이 평균(${avgPts.toFixed(1)}점)의 2배 이상 고배점입니다. `;
      if (highDiffLow.length > 0) {
        comment += `난이도 대비 배점이 높은 문항이 ${lowDiffHigh.length}개 있어 전략적 접근이 가능합니다.`;
      }
    } else {
      comment = `배점 범위 ${minItem?.points || 0}~${maxItem?.points || 0}점, 평균 ${avgPts.toFixed(1)}점입니다. `;
      if (gaps.length > 0) {
        comment += `배점-난이도 격차가 큰 문항이 ${gaps.length}개 발견되어 전략적 시간 배분이 중요합니다.`;
      }
    }

    return {
      chartData: data,
      maxPoints: maxPts,
      gapItems: gaps,
      aiComment: comment,
    };
  }, [questions]);

  if (questions.length === 0) return null;

  const overpriced = gapItems.filter((i) => i.gap > 0);
  const underpriced = gapItems.filter((i) => i.gap <= 0);

  return (
    <Card>
      <Eyebrow icon="chart-bar">문항별 배점</Eyebrow>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 mb-1">
        {(["1", "2", "3", "4", "5"] as DifficultyBand[]).map((d) => (
          <span key={d} className="flex items-center gap-1.5 text-caption">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: DIFFICULTY_COLORS[d] }}
            />
            <span className="text-muted">{d}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-caption">
          <span
            className="w-4 h-0.5 rounded-full"
            style={{ backgroundColor: LINE_COLOR }}
          />
          <span className="text-muted">난이도</span>
        </span>
      </div>

      {/* 차트 — 직접 측정 (ResponsiveContainer 미사용) */}
      <div ref={containerRef} style={{ width: "100%", minWidth: 0 }}>
        <ComposedChart
          width={containerWidth}
          height={280}
          data={chartData}
          margin={{ top: 12, right: 40, bottom: 8, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#F1F5F9"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#94A3B8", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Pretendard Variable", sans-serif', fontStyle: "normal" }}
            tickLine={false}
            axisLine={{ stroke: "#E2E8F0" }}
            interval={0}
          />
          <YAxis
            yAxisId="points"
            tick={{ fontSize: 11, fill: "#94A3B8", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Pretendard Variable", sans-serif', fontStyle: "normal" }}
            tickLine={false}
            axisLine={false}
            domain={[0, Math.ceil(maxPoints * 1.15)]}
            label={{
              value: "배점",
              position: "insideTopLeft",
              offset: 10,
              style: { fontSize: 10, fill: "#94A3B8", fontFamily: "inherit" },
            }}
          />
          <YAxis
            yAxisId="difficulty"
            orientation="right"
            tick={{ fontSize: 10, fill: "#94A3B8", fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Pretendard Variable", sans-serif', fontStyle: "normal" }}
            tickLine={false}
            axisLine={false}
            domain={[0.5, 5.5]}
            ticks={[1, 2, 3, 4, 5]}
          />
          {[1, 2, 3, 4, 5].map((level) => (
            <ReferenceLine
              key={level}
              yAxisId="difficulty"
              y={level}
              stroke="#E2E8F0"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          ))}
          <Tooltip
            contentStyle={{
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              fontSize: 12,
              padding: "8px 12px",
            }}
            formatter={(value: number | string, name: string) => {
              if (name === "points") return [`${value}점`, "배점"];
              if (name === "diffLevel") return [`${value}`, "난이도"];
              return [`${value}`, name];
            }}
            labelFormatter={(label) => `${label}번 문항`}
          />
          <Bar
            yAxisId="points"
            dataKey="points"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
            maxBarSize={36}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
          <Line
            yAxisId="difficulty"
            type="monotone"
            dataKey="diffLevel"
            stroke={LINE_COLOR}
            strokeWidth={2}
            isAnimationActive={false}
            dot={{
              r: 3,
              fill: LINE_COLOR,
              stroke: "#fff",
              strokeWidth: 2,
            }}
            activeDot={{
              r: 5,
              fill: LINE_COLOR,
              stroke: "#fff",
              strokeWidth: 2,
            }}
          />
        </ComposedChart>
      </div>

      {/* AI 코멘트 */}
      {aiComment && (
        <p className="mt-3 pt-3 border-t border-line text-caption text-muted leading-relaxed">
          <span className="text-accent font-semibold mr-1">AI</span>
          {aiComment}
        </p>
      )}

      {/* 배점-난이도 갭 분석 */}
      {gapItems.length > 0 && (
        <div className="mt-4 pt-4 border-t border-line">
          <h4 className="text-caption font-semibold text-text2 mb-3">
            배점-난이도 갭 분석
            <span className="text-muted font-normal ml-1">
              배점과 난이도 사이 격차가 큰 문항
            </span>
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {overpriced.length > 0 && (
              <GapColumn
                items={overpriced}
                stripeColor="#F59E0B"
                accent="amber"
                title="난이도 대비 배점 높음"
                hint="난이도에 비해 배점이 높아 쉽게 점수를 얻을 수 있습니다"
              />
            )}
            {underpriced.length > 0 && (
              <GapColumn
                items={underpriced}
                stripeColor="#3B82F6"
                accent="blue"
                title="배점 대비 난이도 높음"
                hint="난이도가 높은데 배점이 낮아 노력 대비 점수 효율이 낮습니다"
              />
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

// ── 갭 분석 컬럼 ──

interface GapItem {
  name: string;
  points: number;
  difficulty: DifficultyBand;
  gap: number;
}

const GapColumn = ({
  items,
  stripeColor,
  accent,
  title,
  hint,
}: {
  items: GapItem[];
  stripeColor: string;
  accent: "amber" | "blue";
  title: string;
  hint: string;
}) => {
  const badgeStyle = { backgroundColor: stripeColor };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span
          className="w-1 h-4 rounded-full"
          style={{ backgroundColor: stripeColor }}
        />
        <span className="text-caption font-semibold text-text2">{title}</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.name}
            className="px-3 py-2.5 bg-surface2/40 rounded-r2 border border-line"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-small font-bold text-text">
                {item.name}번
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-caption text-muted font-mono">
                  {item.points}점
                </span>
                <span
                  className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold text-white font-mono"
                  style={badgeStyle}
                >
                  {item.gap > 0 ? "+" : ""}
                  {item.gap.toFixed(1)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              {DIFFICULTY_LABELS[item.difficulty]}
              {accent === "amber" ? " " : " "}
              {hint}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuestionPointsChart;
