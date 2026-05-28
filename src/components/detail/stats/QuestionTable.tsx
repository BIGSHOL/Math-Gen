import { useState } from "react";
import { Chip, Icon } from "@app/components/ui";
import type { AnalyzedQuestion } from "@app/types/examAnalysis";

export interface QuestionTableProps {
  questions: AnalyzedQuestion[];
}

const TYPE_KO: Record<string, string> = {
  number: "수와 연산",
  algebra: "대수",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

const DOMAIN_KO: Record<string, string> = {
  calculation: "계산",
  understanding: "이해",
  reasoning: "추론",
  problem_solving: "문제해결",
};

const FORMAT_KO: Record<string, string> = {
  objective: "객관식",
  short_answer: "단답형",
  essay: "서술형",
};

const DIFFICULTY_TONE: Record<string, "ok" | "accent" | "warn" | "danger" | "neutral"> =
  {
    "1": "ok",
    "2": "accent",
    "3": "neutral",
    "4": "warn",
    "5": "danger",
  };

/**
 * 14필드 중 6컬럼 표 + 펼침 (ai_comment).
 * mathlab 의 AnalysisResultView 의 표와 동일 형태.
 */
export const QuestionTable = ({ questions }: QuestionTableProps) => {
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null);

  if (questions.length === 0) {
    return (
      <div className="rounded-r3 border border-dashed border-line bg-surface px-6 py-12 text-center">
        <Icon
          name="folder-open"
          size={28}
          className="text-muted mx-auto mb-2"
        />
        <div className="text-text font-[550]">분석된 문항이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-r3 border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-surface2 text-text2">
          <tr>
            <th className="text-left px-3 py-2.5 font-[550] w-[60px]">번호</th>
            <th className="text-left px-3 py-2.5 font-[550] w-[80px]">난이도</th>
            <th className="text-left px-3 py-2.5 font-[550] w-[100px]">유형</th>
            <th className="text-left px-3 py-2.5 font-[550]">단원</th>
            <th className="text-right px-3 py-2.5 font-[550] w-[80px]">배점</th>
            <th className="text-right px-3 py-2.5 font-[550] w-[80px]">신뢰도</th>
            <th className="w-[40px]"></th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => {
            const isExpanded = expandedRow === q.question_number;
            const confidence = Math.round((q.confidence ?? 0) * 100);
            return (
              <>
                <tr
                  key={`${q.question_number}-row`}
                  className="border-t border-line hover:bg-hover cursor-pointer"
                  onClick={() =>
                    setExpandedRow(isExpanded ? null : q.question_number)
                  }
                >
                  <td className="px-3 py-2.5 font-mono text-text">
                    {q.question_number}
                  </td>
                  <td className="px-3 py-2.5">
                    <Chip
                      tone={DIFFICULTY_TONE[q.difficulty] ?? "neutral"}
                      size="sm"
                    >
                      {q.difficulty}
                    </Chip>
                  </td>
                  <td className="px-3 py-2.5 text-text2">
                    {TYPE_KO[q.question_type] ?? q.question_type}
                  </td>
                  <td className="px-3 py-2.5 text-text2 max-w-0">
                    <div className="truncate" title={q.topic ?? ""}>
                      {q.topic ?? "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text">
                    {q.points ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-muted">
                    {confidence}%
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    <Icon
                      name={isExpanded ? "caret-up" : "caret-down"}
                      size={12}
                    />
                  </td>
                </tr>
                {isExpanded && (
                  <tr
                    key={`${q.question_number}-expand`}
                    className="bg-surface border-t border-line"
                  >
                    <td colSpan={7} className="px-4 py-3">
                      <div className="grid grid-cols-3 gap-4 text-caption text-muted">
                        <div>
                          <div className="text-text2 font-[550] mb-0.5">
                            형식
                          </div>
                          <div className="text-text">
                            {q.question_format
                              ? FORMAT_KO[q.question_format]
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text2 font-[550] mb-0.5">
                            사고력
                          </div>
                          <div className="text-text">
                            {q.ability_domain
                              ? DOMAIN_KO[q.ability_domain]
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text2 font-[550] mb-0.5">
                            난이도 사유
                          </div>
                          <div className="text-text">
                            {q.difficulty_reason ?? "—"}
                          </div>
                        </div>
                      </div>
                      {q.ai_comment && (
                        <div className="mt-3 p-3 rounded-r2 bg-accent-soft border border-accent-soft-strong text-[13px] text-accent-ink leading-relaxed">
                          {q.ai_comment}
                        </div>
                      )}
                      {q.confidence_reason && (
                        <div className="mt-2 text-caption text-muted">
                          신뢰도 사유: {q.confidence_reason}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default QuestionTable;
