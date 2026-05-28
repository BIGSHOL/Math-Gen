import { Icon } from "@app/components/ui";
import { getConfidenceInfo } from "@app/lib/examAnalysisHelpers";
import type { AnalyzedQuestion } from "@app/types/examAnalysis";

/**
 * 신뢰도 chip (Phase N+1).
 *
 * mathlab 의 헤더 "신뢰도 94%" + 본문 색 범례 (90%+ / 70-89% / <70%) carry-over.
 * mathg-gen 의 ok / warn / danger 토큰 사용.
 */
export interface ConfidenceChipProps {
  questions: AnalyzedQuestion[];
}

export const ConfidenceChip = ({ questions }: ConfidenceChipProps) => {
  const info = getConfidenceInfo(questions);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-r1 text-caption font-semibold ${info.toneClass}`}
    >
      <Icon name="shield-check" size={12} weight="bold" />
      신뢰도 <span className="font-mono">{info.avg}%</span>
    </span>
  );
};

/** 신뢰도 색 범례 — 본문 우측 표시 (85+ / 70-84 / <70). */
export const ConfidenceLegend = () => (
  <div className="flex items-center gap-3 text-[11px] text-muted">
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-ok" />
      85%+
    </span>
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-warn" />
      70-84%
    </span>
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-danger" />
      &lt;70%
    </span>
  </div>
);

export default ConfidenceChip;
