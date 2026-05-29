import { Card, Eyebrow, Icon } from "@app/components/ui";
import { KaTeXInline } from "@app/components/math/KaTeXInline";
import type { CommentaryResult } from "@app/types/examAnalysis";

/**
 * AI 시험 총평 카드 (Phase N+3).
 *
 * mathlab 의 헤더 상단 *AI 시험 총평* 카드 carry-over.
 * 자연어 5-8 문장 + 강점/약점/주목 문항 요약 표시.
 *
 * 학습 대책 탭 (N+4) 에서는 score_strategies / teaching_recommendations 활용.
 * 여기서는 *overall_comment + strength_areas + improvement_areas* 만.
 */
export interface AICommentaryCardProps {
  commentary: CommentaryResult | null | undefined;
  /** 분석 in-flight (commentary 가 늦게 도착하는 동안). */
  inflight?: boolean;
}

export const AICommentaryCard = ({
  commentary,
  inflight,
}: AICommentaryCardProps) => {
  // commentary 없고 in-flight 도 아니면 hidden
  if (!commentary && !inflight) return null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 grid place-items-center">
          <Icon name="sparkle" size={14} weight="fill" className="text-white" />
        </div>
        <Eyebrow icon="">AI 시험 총평</Eyebrow>
      </div>

      {inflight && !commentary && (
        <div className="flex items-center gap-2 py-4">
          <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span className="text-small text-muted">총평 생성 중</span>
        </div>
      )}

      {commentary?.overall_comment && (
        <KaTeXInline
          text={commentary.overall_comment}
          className="block text-small text-text2 leading-relaxed whitespace-pre-line"
        />
      )}

      {(commentary?.strength_areas?.length ||
        commentary?.improvement_areas?.length) && (
        <div className="mt-4 pt-4 border-t border-line grid grid-cols-1 lg:grid-cols-2 gap-4">
          {commentary?.strength_areas && commentary.strength_areas.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1 h-4 rounded-full bg-ok" />
                <h4 className="text-caption font-semibold text-text2">
                  강점 영역
                </h4>
              </div>
              <ul className="space-y-1.5">
                {commentary.strength_areas.map((s, i) => (
                  <li
                    key={i}
                    className="text-caption text-text2 leading-relaxed flex gap-1.5"
                  >
                    <span className="text-ok shrink-0">•</span>
                    <KaTeXInline text={s} className="text-caption text-text2" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {commentary?.improvement_areas &&
            commentary.improvement_areas.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1 h-4 rounded-full bg-warn" />
                  <h4 className="text-caption font-semibold text-text2">
                    보완 필요
                  </h4>
                </div>
                <ul className="space-y-1.5">
                  {commentary.improvement_areas.map((s, i) => (
                    <li
                      key={i}
                      className="text-caption text-text2 leading-relaxed flex gap-1.5"
                    >
                      <span className="text-warn shrink-0">•</span>
                      <KaTeXInline text={s} className="text-caption text-text2" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </Card>
  );
};

export default AICommentaryCard;
