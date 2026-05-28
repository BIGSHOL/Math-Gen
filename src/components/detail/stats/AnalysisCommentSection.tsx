import { useMemo, useState } from "react";
import { Card, Eyebrow } from "@app/components/ui";
import {
  ABILITY_DOMAIN_COLORS,
  ABILITY_DOMAIN_LABELS,
  DIFFICULTY_COLORS,
  QUESTION_TYPE_COLORS,
  QUESTION_TYPE_LABELS,
  TYPE_TO_DOMAIN,
} from "@app/lib/examAnalysisHelpers";
import type { AnalyzedQuestion, DifficultyBand } from "@app/types/examAnalysis";

/**
 * AI 코멘트 섹션 (Phase N+2).
 *
 * mathlab `D:\mathlab\src\components\exam-analysis\AnalysisCommentTab.tsx`
 * carry-over. 펼침 → *기본 노출* 로 변환.
 *
 * 각 문항 행: 번호 | 단원 | 난이도/유형/능력/배점 chip + ai_comment + (옵션) 난이도 근거
 *
 * 피드백 기능은 별도 phase 에서 (현재는 시각 우선).
 */
export interface AnalysisCommentSectionProps {
  questions: AnalyzedQuestion[];
}

export const AnalysisCommentSection = ({
  questions,
}: AnalysisCommentSectionProps) => {
  const [showDiffReason, setShowDiffReason] = useState(false);

  const sortedQuestions = useMemo(
    () =>
      [...questions].sort((a, b) => {
        const aNum =
          typeof a.question_number === "string"
            ? parseInt(a.question_number, 10) || 999
            : a.question_number;
        const bNum =
          typeof b.question_number === "string"
            ? parseInt(b.question_number, 10) || 999
            : b.question_number;
        return aNum - bNum;
      }),
    [questions],
  );

  return (
    <Card>
      {/* 상단 — 안내 + 난이도 근거 토글 */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <Eyebrow icon="chat-circle-text">AI 코멘트</Eyebrow>
          <p className="text-caption text-muted mt-1">
            AI 가 각 문항에 대해 분석한 코멘트입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDiffReason((v) => !v)}
          className={`px-2.5 py-1 text-caption rounded-r1 transition-colors ${
            showDiffReason
              ? "bg-accent-soft text-accent font-medium"
              : "bg-surface2 text-muted hover:text-text"
          }`}
        >
          난이도 근거 ({questions.length})
        </button>
      </div>

      {/* 표 */}
      <div className="border border-line rounded-r2 overflow-hidden">
        {/* 헤더 */}
        <div className="grid grid-cols-[52px_140px_1fr] bg-surface2/50 px-3 py-2 border-b border-line text-caption font-medium text-muted">
          <span className="text-center">번호</span>
          <span>단원</span>
          <span>AI 코멘트</span>
        </div>

        {/* 행들 */}
        <div className="divide-y divide-line">
          {sortedQuestions.map((q) => (
            <CommentRow
              key={String(q.question_number)}
              q={q}
              showDiffReason={showDiffReason}
            />
          ))}
        </div>
      </div>

      {sortedQuestions.length === 0 && (
        <div className="text-center py-12 text-small text-muted">
          AI 코멘트 없음
        </div>
      )}
    </Card>
  );
};

// ── 개별 행 ──

const CommentRow = ({
  q,
  showDiffReason,
}: {
  q: AnalyzedQuestion;
  showDiffReason: boolean;
}) => {
  const shortTopic = q.topic
    ? q.topic.split(" > ").pop() || q.topic
    : "—";
  const diff = (q.difficulty || "1") as DifficultyBand;
  const rawDomain =
    q.ability_domain || TYPE_TO_DOMAIN[q.question_type] || "calculation";
  const domain = String(rawDomain).toLowerCase();
  const domainColor = ABILITY_DOMAIN_COLORS[domain] || "#94A3B8";
  const typeColor = QUESTION_TYPE_COLORS[q.question_type] || "#94A3B8";

  return (
    <div className="grid grid-cols-[52px_140px_1fr] px-3 py-2.5 hover:bg-surface2/40 items-start">
      {/* 번호 */}
      <span className="text-small font-bold text-text text-center pt-0.5 font-mono">
        {q.question_number}
      </span>

      {/* 단원 */}
      <span className="text-caption text-text2 pt-1 pr-2 leading-snug">
        {shortTopic}
      </span>

      {/* AI 코멘트 */}
      <div>
        {/* chip 행 */}
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <span className="text-[10px] font-medium text-muted">난이도</span>
          <span
            className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold text-white font-mono"
            style={{ backgroundColor: DIFFICULTY_COLORS[diff] }}
          >
            {diff}
          </span>
          <span className="text-[10px] text-muted/40 mx-0.5">·</span>
          <span className="text-[10px] font-medium text-muted">유형</span>
          <span
            className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              backgroundColor: `${typeColor}20`,
              color: typeColor,
            }}
          >
            {QUESTION_TYPE_LABELS[q.question_type] || q.question_type}
          </span>
          <span className="text-[10px] text-muted/40 mx-0.5">·</span>
          <span className="text-[10px] font-medium text-muted">능력</span>
          <span
            className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold"
            style={{
              backgroundColor: `${domainColor}20`,
              color: domainColor,
            }}
          >
            {ABILITY_DOMAIN_LABELS[domain] || domain}
          </span>
          {q.points != null && (
            <>
              <span className="text-[10px] text-muted/40 mx-0.5">·</span>
              <span className="text-[10px] font-medium text-muted">배점</span>
              <span className="text-[10px] font-bold text-text2 font-mono">
                {q.points}점
              </span>
            </>
          )}
        </div>

        {/* ai_comment */}
        {q.ai_comment && (
          <p className="text-caption text-text2 leading-relaxed">
            {q.ai_comment}
          </p>
        )}

        {/* 난이도 근거 (토글) */}
        {showDiffReason && q.difficulty_reason && (
          <p className="text-[11px] text-muted mt-1">
            난이도 근거: {q.difficulty_reason}
          </p>
        )}
      </div>
    </div>
  );
};

export default AnalysisCommentSection;
