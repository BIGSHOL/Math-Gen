import { useMemo, useState } from "react";
import { Card, Eyebrow, Icon } from "@app/components/ui";
import { KaTeXInline } from "@app/components/math/KaTeXInline";
import {
  deriveStudyStrategy,
  type ChapterGroup,
} from "@app/lib/studyStrategyDerive";
import {
  ESSAY_CHECKLIST,
  FOUR_WEEK_TIMELINE,
  genericMistakesByTypes,
} from "@app/lib/studyStrategyData";
import {
  DIFFICULTY_COLORS,
  DIFFICULTY_LABELS,
} from "@app/lib/examAnalysisHelpers";
import type {
  AnalyzedQuestion,
  CommentaryResult,
  DifficultyBand,
} from "@app/types/examAnalysis";

/**
 * 학습 대책 탭 (Phase N+4).
 *
 * mathlab `StudyStrategyTab.tsx` 의 고정 데이터(13K 줄) 대신 *AI 생성*
 * (commentary.study_strategy) 로 대체 (사용자 결정 2026-05-29). Sonnet 이
 * 시험지 단원 기반으로 선수학습 연계 / 킬러 함정 / 단원 실수 / 시간 팁을 생성.
 * study_strategy 없는 구 분석은 derived/generic fallback.
 *
 * 섹션 (위→아래 = 분석 → 전략 → 대비 → 타임라인):
 *  1. TopicAnalysis        (derived)              출제 영역별 상세 분석
 *  2. GradeConnections     (study_strategy)       선수학습 연계 *AI*
 *  3. LearningStrategies   (teaching_recommendations) 영역별 학습 전략
 *  4. LevelStrategies      (score_strategies)     수준별 학습 전략
 *  5. KillerPatterns       (notable_questions)    주목 문항
 *  6. KillerPatternsAI     (study_strategy)       킬러 문항 함정 *AI*
 *  7. EssayPreparation     (고정 체크리스트)        서술형 대비
 *  8. CommonMistakes       (study_strategy || generic) 자주 하는 실수
 *  9. TimeAllocation       (derived + study_strategy tips) 시험 시간 배분
 * 10. Timeline             (고정 데이터)            4주 타임라인
 */
export interface StudyStrategySectionProps {
  questions: AnalyzedQuestion[];
  commentary: CommentaryResult | null | undefined;
}

/** commentary.study_strategy 의 non-null shape (AI 생성 학습 대책). */
type StudyStrategy = NonNullable<CommentaryResult["study_strategy"]>;

const CHAPTER_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#6366f1",
  "#14b8a6",
];

export const StudyStrategySection = ({
  questions,
  commentary,
}: StudyStrategySectionProps) => {
  const { chapterGroups, totalPoints } = useMemo(
    () => deriveStudyStrategy(questions),
    [questions],
  );
  const ss = commentary?.study_strategy;

  if (questions.length === 0) {
    return (
      <Card>
        <div className="text-center text-muted text-small py-6">
          분석할 문항이 없습니다
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <TopicAnalysis chapterGroups={chapterGroups} totalPoints={totalPoints} />
      {ss?.grade_connections && ss.grade_connections.length > 0 && (
        <GradeConnections connections={ss.grade_connections} />
      )}
      {commentary?.teaching_recommendations &&
        commentary.teaching_recommendations.length > 0 && (
          <LearningStrategies
            recommendations={commentary.teaching_recommendations}
          />
        )}
      {commentary?.score_strategies &&
        commentary.score_strategies.length > 0 && (
          <LevelStrategies strategies={commentary.score_strategies} />
        )}
      {commentary?.notable_questions &&
        commentary.notable_questions.length > 0 && (
          <KillerPatterns notable={commentary.notable_questions} />
        )}
      {ss?.killer_patterns && ss.killer_patterns.length > 0 && (
        <KillerPatternsAI patterns={ss.killer_patterns} />
      )}
      <EssayPreparation questions={questions} />
      <CommonMistakes questions={questions} aiMistakes={ss?.common_mistakes} />
      <TimeAllocation
        chapterGroups={chapterGroups}
        totalPoints={totalPoints}
        tips={ss?.time_tips}
      />
      <Timeline />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// §1b. GradeConnectionsSection — 선수학습 연계 (study_strategy, AI)
// ════════════════════════════════════════════════════════════════════

const IMPORTANCE_META: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  critical: { label: "필수", bg: "bg-danger-soft", text: "text-danger" },
  high: { label: "중요", bg: "bg-warn-soft", text: "text-warn" },
  recommended: { label: "권장", bg: "bg-accent-soft", text: "text-accent" },
};

const GradeConnections = ({
  connections,
}: {
  connections: NonNullable<StudyStrategy["grade_connections"]>;
}) => (
  <Card>
    <Eyebrow icon="flow-arrow">선수학습 연계</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      이 시험 단원을 이해하려면 먼저 다져야 할 이전 학년·단원 개념
    </p>
    <div className="space-y-2">
      {connections.map((c, idx) => {
        const meta = IMPORTANCE_META[c.importance] ?? IMPORTANCE_META.recommended;
        return (
          <div
            key={idx}
            className="rounded-r2 border border-line p-3 bg-surface2/40"
          >
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span
                className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold ${meta.bg} ${meta.text}`}
              >
                {meta.label}
              </span>
              <KaTeXInline
                text={c.prerequisite}
                className="text-small font-semibold text-text"
              />
              <Icon name="arrow-right" size={12} className="text-muted" />
              <KaTeXInline text={c.unit} className="text-small text-text2" />
            </div>
            <KaTeXInline
              text={c.warning}
              className="text-caption text-muted leading-relaxed"
            />
          </div>
        );
      })}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════════════
// §1. TopicAnalysisSection — 대단원 그룹핑
// ════════════════════════════════════════════════════════════════════

const TopicAnalysis = ({
  chapterGroups,
  totalPoints,
}: {
  chapterGroups: ChapterGroup[];
  totalPoints: number;
}) => {
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    new Set(),
  );
  const totalTopics = chapterGroups.reduce((s, g) => s + g.topics.length, 0);

  const toggleChapter = (name: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Card>
      <Eyebrow icon="book-open">출제 영역별 상세 분석</Eyebrow>
      <p className="text-caption text-muted mt-1 mb-3">
        {chapterGroups.length}개 대단원 · {totalTopics}개 소단원 · 총{" "}
        {totalPoints}점
      </p>

      <div className="space-y-2">
        {chapterGroups.map((group, idx) => {
          const isOpen = expandedChapters.has(group.chapterName);
          const color = CHAPTER_COLORS[idx % CHAPTER_COLORS.length];
          const pctBadge =
            totalPoints > 0
              ? Math.round((group.totalPoints / totalPoints) * 100)
              : 0;
          const hasEssay = group.essayCount > 0;
          const isKeyChapter = group.percentage >= 25;
          const isHighDifficulty = group.avgDifficulty >= 3;

          return (
            <div
              key={group.chapterName}
              className="rounded-r2 border border-line overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleChapter(group.chapterName)}
                className="w-full px-3 py-2.5 flex items-center gap-2.5 bg-surface2/40 hover:bg-surface2/70 transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-small font-medium text-text text-left flex-1 min-w-0 truncate">
                  {group.chapterName}
                  <span className="text-caption text-muted font-normal ml-1.5">
                    ({group.topics.length}개 소단원)
                  </span>
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasEssay && (
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-warn-soft text-warn">
                      서술형 {group.essayNumbers.length}번
                    </span>
                  )}
                  {isKeyChapter && (
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-accent-soft text-accent flex items-center gap-0.5">
                      <Icon name="star" size={9} weight="fill" />
                      핵심 대단원
                    </span>
                  )}
                  {isHighDifficulty && (
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-danger-soft text-danger">
                      고난도 집중
                    </span>
                  )}
                </div>

                <span className="text-caption text-muted shrink-0 font-mono">
                  {group.questionCount}문항
                </span>
                <span className="text-caption text-muted shrink-0 font-mono w-10 text-right">
                  {group.totalPoints}점
                </span>
                <span
                  className="inline-flex px-2 py-0.5 rounded-sm text-[10px] font-bold text-white shrink-0 min-w-[36px] justify-center font-mono"
                  style={{ backgroundColor: color }}
                >
                  {pctBadge}%
                </span>
                <Icon
                  name="caret-down"
                  size={12}
                  className={`text-muted transition-transform shrink-0 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-line bg-surface">
                  {group.topics.map((topic, tIdx) => {
                    const topicPct =
                      totalPoints > 0
                        ? Math.round((topic.totalPoints / totalPoints) * 100)
                        : 0;
                    return (
                      <div
                        key={tIdx}
                        className="px-4 py-2 flex items-center gap-2 border-b border-line last:border-b-0"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-muted/40 shrink-0 ml-2" />
                        <span className="text-caption text-text2 flex-1 min-w-0 truncate">
                          {topic.shortTopic || topic.topic}
                        </span>
                        <div className="flex gap-1 shrink-0">
                          {topic.difficulties.map((diff, dIdx) => (
                            <span
                              key={dIdx}
                              className="px-1 py-0.5 rounded-sm text-[9px] font-medium text-white font-mono"
                              style={{
                                backgroundColor:
                                  DIFFICULTY_COLORS[diff as DifficultyBand] ||
                                  "#94A3B8",
                              }}
                            >
                              {DIFFICULTY_LABELS[diff as DifficultyBand] ?? diff}
                            </span>
                          ))}
                        </div>
                        <span className="text-[10px] text-muted shrink-0 font-mono">
                          {topic.questionCount}문항
                        </span>
                        <span className="text-[10px] text-muted shrink-0 font-mono w-8 text-right">
                          {topic.totalPoints}점
                        </span>
                        <span className="text-[10px] text-muted shrink-0 w-8 text-right font-mono">
                          {topicPct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════════════
// §2. LearningStrategiesSection — teaching_recommendations
// ════════════════════════════════════════════════════════════════════

const PRIORITY_COLORS: Record<number, string> = {
  1: "#EF4444", // red
  2: "#F97316", // orange
  3: "#EAB308", // yellow
  4: "#3B82F6", // blue
  5: "#10B981", // green
};

const LearningStrategies = ({
  recommendations,
}: {
  recommendations: NonNullable<CommentaryResult["teaching_recommendations"]>;
}) => (
  <Card>
    <Eyebrow icon="target">영역별 학습 전략</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      우선순위 1(최우선) ~ 5
    </p>
    <div className="space-y-2">
      {recommendations.map((rec, idx) => {
        const color = PRIORITY_COLORS[rec.priority] || "#94A3B8";
        return (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-r2 bg-surface2/40 border border-line"
          >
            <span
              className="px-2 py-0.5 rounded-sm text-[10px] font-bold text-white shrink-0 mt-0.5 font-mono"
              style={{ backgroundColor: color }}
            >
              P{rec.priority}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-small font-semibold text-text mb-0.5">
                {rec.topic}
              </div>
              <KaTeXInline
                text={rec.reason}
                className="text-caption text-text2 leading-relaxed"
              />
            </div>
          </div>
        );
      })}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════════════
// §3. LevelStrategiesSection — score_strategies A/B/C
// ════════════════════════════════════════════════════════════════════

const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  "A등급": { bg: "#10B981", text: "#FFFFFF" },
  "B등급": { bg: "#3B82F6", text: "#FFFFFF" },
  "C등급": { bg: "#F59E0B", text: "#FFFFFF" },
};

const LevelStrategies = ({
  strategies,
}: {
  strategies: NonNullable<CommentaryResult["score_strategies"]>;
}) => (
  <Card>
    <Eyebrow icon="ranking">수준별 학습 전략</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      등급별 점수 확보 핵심 포인트
    </p>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {strategies.map((s, idx) => {
        const colors = GRADE_COLORS[s.grade] ?? {
          bg: "#94A3B8",
          text: "#FFFFFF",
        };
        return (
          <div
            key={idx}
            className="rounded-r2 border border-line overflow-hidden flex flex-col"
          >
            <div
              className="px-3 py-2 flex items-center justify-between"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              <span className="text-small font-bold">{s.grade}</span>
              <span className="text-caption font-mono opacity-90">
                {s.target}
              </span>
            </div>
            <div className="p-3 bg-surface flex-1">
              {s.points && s.points.length > 0 ? (
                <ul className="space-y-1.5">
                  {s.points.map((p, pIdx) => (
                    <li
                      key={pIdx}
                      className="text-caption text-text2 leading-relaxed flex gap-1.5"
                    >
                      <span className="text-accent shrink-0">•</span>
                      <KaTeXInline text={p} className="text-caption text-text2" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted">
                  {s.strategy || "—"}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════════════
// §4. KillerPatternsSection — notable_questions
// ════════════════════════════════════════════════════════════════════

const KillerPatterns = ({
  notable,
}: {
  notable: NonNullable<CommentaryResult["notable_questions"]>;
}) => (
  <Card>
    <Eyebrow icon="warning-octagon">주목 문항</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      변별력이 높거나 출제 의도가 돋보이는 문항
    </p>
    <div className="space-y-2">
      {notable.map((q, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 p-3 rounded-r2 bg-danger-soft/30 border border-danger/20"
        >
          <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold text-white shrink-0 mt-0.5 font-mono bg-danger">
            {q.question_number}번
          </span>
          <KaTeXInline
            text={q.comment}
            className="text-caption text-text2 leading-relaxed flex-1"
          />
        </div>
      ))}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════════════
// §4b. KillerPatternsAISection — 킬러 문항 함정 (study_strategy, AI)
// ════════════════════════════════════════════════════════════════════

const KillerPatternsAI = ({
  patterns,
}: {
  patterns: NonNullable<StudyStrategy["killer_patterns"]>;
}) => (
  <Card>
    <Eyebrow icon="fire">킬러 문항 함정</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      고난도 단원의 전형적 함정 + 대응 전략
    </p>
    <div className="space-y-2">
      {patterns.map((p, idx) => (
        <div
          key={idx}
          className="rounded-r2 border border-danger/20 p-3 bg-danger-soft/20"
        >
          <KaTeXInline
            text={p.unit}
            className="text-small font-semibold text-text block mb-1.5"
          />
          <div className="flex gap-1.5 mb-1.5">
            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-danger-soft text-danger shrink-0 h-fit">
              함정
            </span>
            <KaTeXInline
              text={p.trap}
              className="text-caption text-text2 leading-relaxed"
            />
          </div>
          <div className="flex gap-1.5">
            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-ok-soft text-ok shrink-0 h-fit">
              대응
            </span>
            <KaTeXInline
              text={p.solution}
              className="text-caption text-text2 leading-relaxed"
            />
          </div>
        </div>
      ))}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════════════
// §5. EssayPreparationSection — 서술형 대비 (체크리스트, 고정 데이터)
// ════════════════════════════════════════════════════════════════════

const EssayPreparation = ({ questions }: { questions: AnalyzedQuestion[] }) => {
  const essayQuestions = useMemo(
    () =>
      questions.filter(
        (q) =>
          q.question_format === "essay" || q.question_format === "short_answer",
      ),
    [questions],
  );
  const totalEssayPoints = essayQuestions.reduce(
    (s, q) => s + (q.points || 0),
    0,
  );

  if (essayQuestions.length === 0) return null;

  return (
    <Card>
      <Eyebrow icon="file-text">서술형 대비 전략</Eyebrow>
      <p className="text-caption text-muted mt-1 mb-3">
        {essayQuestions.length}문항 · 총 {totalEssayPoints}점 — 감점 방지 체크리스트
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ESSAY_CHECKLIST.map((c) => (
          <div
            key={c.category}
            className="rounded-r2 border border-line p-3 bg-surface2/40"
          >
            <div className="text-small font-semibold text-text mb-2">
              {c.category}
            </div>
            <ul className="space-y-1 mb-2">
              {c.checkPoints.map((p, i) => (
                <li
                  key={i}
                  className="text-caption text-text2 flex gap-1.5 leading-relaxed"
                >
                  <Icon
                    name="check-circle"
                    size={12}
                    className="text-ok shrink-0 mt-0.5"
                  />
                  {p}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1">
              {c.commonErrors.map((e) => (
                <span
                  key={e}
                  className="px-1.5 py-0.5 rounded-sm text-[10px] bg-danger-soft text-danger"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════════════
// §6. TimeAllocationSection — 시험 시간 배분 (배점 비율 derived)
// ════════════════════════════════════════════════════════════════════

const EXAM_MINUTES = 45;

const TIME_TIP_META: Array<{
  key: "quick" | "caution" | "saving";
  label: string;
  icon: string;
  color: string;
}> = [
  { key: "quick", label: "빠르게", icon: "lightning", color: "text-ok" },
  { key: "caution", label: "주의", icon: "warning", color: "text-warn" },
  { key: "saving", label: "시간 절약", icon: "timer", color: "text-accent" },
];

const TimeAllocation = ({
  chapterGroups,
  totalPoints,
  tips,
}: {
  chapterGroups: ChapterGroup[];
  totalPoints: number;
  tips?: StudyStrategy["time_tips"];
}) => {
  const allocations = useMemo(() => {
    return chapterGroups
      .map((ch) => {
        const basePct = totalPoints > 0 ? ch.totalPoints / totalPoints : 0;
        const diffMult =
          ch.avgDifficulty >= 3 ? 1.3 : ch.avgDifficulty >= 2 ? 1.1 : 0.9;
        const minutes = Math.max(
          1,
          Math.round(basePct * (EXAM_MINUTES - 5) * diffMult),
        );
        return { name: ch.chapterName, minutes, points: ch.totalPoints };
      })
      .sort((a, b) => b.minutes - a.minutes);
  }, [chapterGroups, totalPoints]);

  if (allocations.length === 0) return null;
  const maxMin = Math.max(...allocations.map((a) => a.minutes), 1);

  const tipColumns = TIME_TIP_META.map((meta) => ({
    ...meta,
    items: tips?.[meta.key] ?? [],
  })).filter((col) => col.items.length > 0);

  return (
    <Card>
      <Eyebrow icon="clock">시험 시간 배분</Eyebrow>
      <p className="text-caption text-muted mt-1 mb-3">
        {EXAM_MINUTES}분 기준 · 배점 비율 + 난이도 가중 추정 (검토 5분 제외)
      </p>
      <div className="space-y-2.5">
        {allocations.map((a) => (
          <div key={a.name} className="flex items-center gap-2.5">
            <span className="w-32 text-caption text-text2 shrink-0 truncate">
              {a.name}
            </span>
            <div className="flex-1 bg-surface3 rounded-r1 h-5 overflow-hidden">
              <div
                className="h-full rounded-r1 bg-accent flex items-center justify-end pr-2 text-white text-[10px] font-bold transition-all"
                style={{ width: `${Math.max((a.minutes / maxMin) * 100, 14)}%` }}
              >
                {a.minutes}분
              </div>
            </div>
            <span className="w-10 text-right text-caption text-muted font-mono shrink-0">
              {a.points}점
            </span>
          </div>
        ))}
      </div>

      {tipColumns.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-3 gap-3">
          {tipColumns.map((col) => (
            <div key={col.key}>
              <div
                className={`flex items-center gap-1.5 mb-1.5 text-caption font-semibold ${col.color}`}
              >
                <Icon name={col.icon} size={13} />
                {col.label}
              </div>
              <ul className="space-y-1">
                {col.items.map((t, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-text2 flex gap-1.5 leading-relaxed"
                  >
                    <span className={`shrink-0 ${col.color}`}>·</span>
                    <KaTeXInline text={t} className="text-[11px] text-text2" />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ════════════════════════════════════════════════════════════════════
// §7. CommonMistakesSection — 자주 하는 실수 (영역 기반 제네릭)
// ════════════════════════════════════════════════════════════════════

const CommonMistakes = ({
  questions,
  aiMistakes,
}: {
  questions: AnalyzedQuestion[];
  aiMistakes?: StudyStrategy["common_mistakes"];
}) => {
  const groups = useMemo(() => {
    const types = questions
      .map((q) => q.question_type as string)
      .filter((t) => Boolean(t));
    return genericMistakesByTypes(types);
  }, [questions]);

  // ── AI 생성 (study_strategy.common_mistakes) 우선 — 시험 단원 기반 구체적 ──
  if (aiMistakes && aiMistakes.length > 0) {
    return (
      <Card>
        <Eyebrow icon="warning">자주 하는 실수</Eyebrow>
        <p className="text-caption text-muted mt-1 mb-3">
          출제 단원별 흔한 실수 + 예방법
        </p>
        <div className="space-y-2">
          {aiMistakes.map((m, i) => (
            <div
              key={i}
              className="rounded-r2 border border-line p-3 bg-surface2/40"
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-accent-soft text-accent">
                  {m.topic}
                </span>
              </div>
              <div className="flex gap-1.5 mb-1.5">
                <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-danger-soft text-danger shrink-0 h-fit">
                  실수
                </span>
                <KaTeXInline
                  text={m.mistake}
                  className="text-caption text-text2 leading-relaxed"
                />
              </div>
              <div className="flex gap-1.5">
                <Icon
                  name="lightbulb"
                  size={12}
                  className="text-warn shrink-0 mt-0.5"
                />
                <KaTeXInline
                  text={m.prevention}
                  className="text-[11px] text-muted leading-relaxed"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // ── fallback: 영역 기반 제네릭 (구 분석 — study_strategy 없음) ──
  if (groups.length === 0) return null;

  return (
    <Card>
      <Eyebrow icon="warning">자주 하는 실수</Eyebrow>
      <p className="text-caption text-muted mt-1 mb-3">
        출제 영역별 흔한 실수 유형 + 예방법
      </p>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.topic}>
            <div className="text-small font-semibold text-text mb-1.5">
              {g.topic}
            </div>
            <div className="space-y-1.5">
              {g.items.map((m, i) => (
                <div
                  key={i}
                  className="rounded-r2 border border-line p-2.5 bg-surface2/40"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-danger-soft text-danger">
                      {m.type}
                    </span>
                    <span className="text-caption text-text2">
                      {m.description}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted flex gap-1">
                    <Icon
                      name="lightbulb"
                      size={11}
                      className="text-warn shrink-0 mt-0.5"
                    />
                    {m.prevention}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════════════
// §8. TimelineSection — 4주 전 학습 타임라인 (고정 데이터)
// ════════════════════════════════════════════════════════════════════

const TIMELINE_COLORS = ["#3B82F6", "#8B5CF6", "#F97316", "#EF4444"];

const Timeline = () => (
  <Card>
    <Eyebrow icon="calendar">4주 전 학습 타임라인</Eyebrow>
    <p className="text-caption text-muted mt-1 mb-3">
      시험 4주 전부터 체계적으로 준비하는 로드맵
    </p>
    <div className="space-y-3">
      {FOUR_WEEK_TIMELINE.map((w, idx) => {
        const color = TIMELINE_COLORS[idx % TIMELINE_COLORS.length];
        return (
          <div key={w.week} className="flex gap-3">
            <div className="flex flex-col items-center shrink-0">
              <div
                className="w-2.5 h-2.5 rounded-full mt-1"
                style={{ backgroundColor: color }}
              />
              {idx < FOUR_WEEK_TIMELINE.length - 1 && (
                <div className="w-px flex-1 bg-line mt-1" />
              )}
            </div>
            <div className="pb-1 flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span
                  className="text-small font-bold"
                  style={{ color }}
                >
                  {w.week}
                </span>
                <span className="text-caption text-text2 font-medium">
                  {w.title}
                </span>
              </div>
              <ul className="space-y-0.5">
                {w.tasks.map((t, i) => (
                  <li
                    key={i}
                    className="text-caption text-muted flex gap-1.5 leading-relaxed"
                  >
                    <span className="text-muted/50 shrink-0">·</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  </Card>
);

export default StudyStrategySection;
