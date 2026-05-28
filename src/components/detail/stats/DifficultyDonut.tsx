import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DifficultyDistribution } from "@app/types/examAnalysis";

export interface DifficultyDonutProps {
  data: DifficultyDistribution;
}

/** 5단계 난이도 색상 — 1=쉬움 (green) → 5=킬러 (red) */
const COLORS: Record<keyof DifficultyDistribution, string> = {
  "1": "#10B981", // green-500
  "2": "#3B82F6", // blue-500
  "3": "#EAB308", // yellow-500
  "4": "#F97316", // orange-500
  "5": "#EF4444", // red-500
};

const LABELS: Record<keyof DifficultyDistribution, string> = {
  "1": "1 (기본)",
  "2": "2 (표준)",
  "3": "3 (응용)",
  "4": "4 (심화)",
  "5": "5 (킬러)",
};

/**
 * 5단계 난이도 도넛 — mathlab 의 DifficultyDonutChart 와 동일 형태.
 * 각 단계 색상 + 카운트 + 비율. 호버 시 tooltip.
 */
export const DifficultyDonut = ({ data }: DifficultyDonutProps) => {
  const chartData = (["1", "2", "3", "4", "5"] as const)
    .map((band) => ({
      name: LABELS[band],
      band,
      value: data[band],
      color: COLORS[band],
    }))
    .filter((d) => d.value > 0);

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-muted text-small">
        데이터 없음
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {chartData.map((entry) => (
                <Cell key={entry.band} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value}문항 (${Math.round((value / total) * 100)}%)`,
                name,
              ]}
              contentStyle={{
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                fontSize: "12.5px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* 범례 — 도넛 밑에 별도 grid */}
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {(["1", "2", "3", "4", "5"] as const).map((band) => (
          <div
            key={band}
            className="flex flex-col items-center text-center min-w-0"
          >
            <span
              className="inline-block w-3 h-3 rounded-full mb-1"
              style={{ backgroundColor: COLORS[band] }}
            />
            <span className="text-[10.5px] text-muted whitespace-nowrap">
              {LABELS[band]}
            </span>
            <span className="text-[13px] text-text font-mono font-medium">
              {data[band]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DifficultyDonut;
