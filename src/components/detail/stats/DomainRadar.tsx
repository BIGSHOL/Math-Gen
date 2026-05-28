import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { DomainDistribution } from "@app/types/examAnalysis";

export interface DomainRadarProps {
  data: DomainDistribution;
}

const DOMAIN_LABELS: Record<keyof DomainDistribution, string> = {
  calculation: "계산력",
  understanding: "이해력",
  reasoning: "추론력",
  problem_solving: "문제해결력",
};

/**
 * 4축 사고력 영역 레이더 — mathlab 의 TypeRadarChart 와 동일 형태.
 * 계산력 / 이해력 / 추론력 / 문제해결력 4영역.
 */
export const DomainRadar = ({ data }: DomainRadarProps) => {
  const chartData = (
    ["calculation", "understanding", "reasoning", "problem_solving"] as const
  ).map((key) => ({
    domain: DOMAIN_LABELS[key],
    value: data[key],
  }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-muted text-small">
        데이터 없음
      </div>
    );
  }

  return (
    <div className="w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData}>
          <PolarGrid stroke="#E5E7EB" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{
              fontSize: 11,
              fill: "#374151",
              fontFamily: "inherit",
            }}
          />
          <PolarRadiusAxis
            tick={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Radar
            name="문항 수"
            dataKey="value"
            stroke="#0EA5E9"
            fill="#0EA5E9"
            fillOpacity={0.3}
          />
          <Tooltip
            formatter={(value: number) => [`${value}문항`, "문항 수"]}
            contentStyle={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              fontSize: "12.5px",
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DomainRadar;
