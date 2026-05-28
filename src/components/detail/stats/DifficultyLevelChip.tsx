import { useMemo } from "react";
import {
  DIFFICULTY_BAR_COLORS,
  getDifficultyBreakdown,
  interpolateDifficultyColor,
} from "@app/lib/examAnalysisHelpers";
import type { AnalysisSummary } from "@app/types/examAnalysis";

/**
 * 시험 난이도 Level chip (Phase N+1).
 *
 * mathlab 의 우상단 "Level 2.6 / 1-5 visualization / 21문항 가중평균" 디자인 carry-over.
 *
 * 표시:
 *  - 상단 라벨: "시험 난이도"
 *  - 1-5 단계 5개 작은 박스 — 가중평균 *반올림* 단계 강조 (다른 단계는 흐림)
 *  - 우측: "Level X.X" 큰 숫자 (보간 색상)
 *  - 하단: "N문항 가중평균"
 */
export interface DifficultyLevelChipProps {
  summary: AnalysisSummary | null;
}

export const DifficultyLevelChip = ({ summary }: DifficultyLevelChipProps) => {
  const breakdown = useMemo(() => getDifficultyBreakdown(summary), [summary]);

  if (!breakdown) return null;

  const { total, weightedAvg } = breakdown;
  const rounded = Math.round(weightedAvg);
  const color = interpolateDifficultyColor(weightedAvg);

  return (
    <div className="flex items-center gap-3 px-3.5 py-2 rounded-r2 bg-surface2/60 border border-line">
      {/* 좌측 — 라벨 + 1-5 단계 */}
      <div>
        <div className="text-[10px] text-muted leading-none mb-1.5">
          시험 난이도
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((level) => {
            const isActive = level === rounded;
            return (
              <div
                key={level}
                className="w-6 h-6 rounded-r1 grid place-items-center text-[10px] font-bold transition-all"
                style={
                  isActive
                    ? {
                        backgroundColor: DIFFICULTY_BAR_COLORS[level - 1],
                        color: "white",
                        boxShadow: `0 1px 4px ${DIFFICULTY_BAR_COLORS[level - 1]}40`,
                      }
                    : {
                        backgroundColor: "transparent",
                        color: "#94A3B8",
                        border: "1px solid #E2E8F0",
                      }
                }
              >
                {level}
              </div>
            );
          })}
        </div>
      </div>

      {/* 우측 — Level X.X + N문항 가중평균 */}
      <div className="text-right border-l border-line pl-3">
        <div
          className="text-[18px] font-bold leading-none font-mono"
          style={{ color }}
        >
          Level {weightedAvg.toFixed(1)}
        </div>
        <div className="text-[10px] text-muted mt-1">
          {total}문항 가중평균
        </div>
      </div>
    </div>
  );
};

export default DifficultyLevelChip;
