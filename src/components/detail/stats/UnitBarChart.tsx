import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TypeDistribution } from "@app/types/examAnalysis";

export interface UnitBarChartProps {
  data: TypeDistribution;
}

const TYPE_LABELS: Record<keyof TypeDistribution, string> = {
  number: "수와 연산",
  algebra: "대수",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

const TYPE_COLORS: Record<keyof TypeDistribution, string> = {
  number: "#0EA5E9", // sky-500 (accent)
  algebra: "#8B5CF6", // violet-500
  function: "#EC4899", // pink-500
  geometry: "#10B981", // green-500
  statistics: "#F59E0B", // amber-500
};

/**
 * 단원 영역별 막대 — mathlab 의 QuestionPointsChart 와 동일 형태.
 * 5개 영역 (number/algebra/function/geometry/statistics) 의 문항 수.
 */
export const UnitBarChart = ({ data }: UnitBarChartProps) => {
  const chartData = (
    ["number", "algebra", "function", "geometry", "statistics"] as const
  ).map((key) => ({
    label: TYPE_LABELS[key],
    value: data[key],
    color: TYPE_COLORS[key],
  }));

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[220px] text-muted text-small">
        데이터 없음
      </div>
    );
  }

  const tickFont = { fontFamily: "inherit", fontStyle: "normal" } as const;

  return (
    <div className="w-full h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6B7280", ...tickFont }}
            axisLine={{ stroke: "#E5E7EB" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#6B7280", ...tickFont }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value: number) => [`${value}문항`, "문항 수"]}
            contentStyle={{
              background: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              fontSize: "12.5px",
            }}
            cursor={{ fill: "#F9FAFB" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default UnitBarChart;
