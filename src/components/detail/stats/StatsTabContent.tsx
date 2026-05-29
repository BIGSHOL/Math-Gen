import { useMemo, useState } from "react";
import { Btn, Card, Eyebrow, Icon, Segmented } from "@app/components/ui";
import { useExamAnalysis } from "@app/hooks/useExamAnalysis";
import type { PageWithUrls } from "@app/hooks/useDetailData";
import type { OCRProblem } from "@app/stores/wizardStore";
import { DifficultyDonut } from "./DifficultyDonut";
import { UnitBarChart } from "./UnitBarChart";
import { DomainRadar } from "./DomainRadar";
import { DifficultyLevelChip } from "./DifficultyLevelChip";
import { ConfidenceChip, ConfidenceLegend } from "./ConfidenceChip";
import { EssayAnalysisSection } from "./EssayAnalysisSection";
import { QuestionPointsChart } from "./QuestionPointsChart";
import { DiscriminationSection } from "./DiscriminationSection";
import { AnalysisCommentSection } from "./AnalysisCommentSection";
import { AICommentaryCard } from "./AICommentaryCard";
import { StudyStrategySection } from "./StudyStrategySection";
import { ReanalyzeModal } from "./ReanalyzeModal";
import { V4BlogView, V4_BLOG_ENABLED, type V4Meta } from "./V4BlogView";

type StatsSubTab = "basic" | "comment" | "strategy" | "v4";

const SUB_TAB_OPTIONS = [
  { value: "basic" as const, label: "기본 분석", icon: "chart-bar" },
  { value: "comment" as const, label: "AI 코멘트", icon: "chat-circle-text" },
  { value: "strategy" as const, label: "학습 대책", icon: "target" },
  // Phase N+5 (비활성) — V4_BLOG_ENABLED=false 면 미노출
  ...(V4_BLOG_ENABLED
    ? [{ value: "v4" as const, label: "학원 블로그", icon: "newspaper" }]
    : []),
];

/**
 * DB enum grade ("middle1" 등) → mathlab prompt 기준 한국어 ("중1" 등) 매핑.
 * mathlab 의 MATH_TOPICS / 카탈로그가 한국어 키 기반.
 */
const GRADE_TO_KO: Record<string, string> = {
  middle1: "중1",
  middle2: "중2",
  middle3: "중3",
  high1: "고1",
  high2: "고2",
  high3: "고3",
  retake: "재수",
};

const toKoreanGrade = (raw: string): string =>
  GRADE_TO_KO[raw] ?? raw;

export interface StatsTabContentProps {
  testId: string;
  grade: string;
  /** 시험지 페이지 — 이미지 base64 추출 source. */
  pages: PageWithUrls[];
  /** OCR 결과 — 서술형 포함 여부 판정용. */
  problems: OCRProblem[];
}

/**
 * 시험지 분석 탭 — DetailScreen 의 "stats" 활성 시 마운트.
 *
 * 흐름:
 *   1. fetchExamAnalysis(testId) — 기존 분석 결과 hydrate
 *   2. 없으면 "분석 시작" CTA 표시
 *   3. 사용자 클릭 → analyzeExam (Sonnet 4.6 vision + caching) → upsert → 차트
 *   4. 4 차트 + 14필드 표 노출
 */
export const StatsTabContent = ({
  testId,
  grade,
  pages,
  problems,
}: StatsTabContentProps) => {
  // 페이지 이미지 base64 추출 — Storage signed URL.
  // 문제 페이지만 대상 (표지 / 답안지 제외).
  const pageImages = useMemo(() => {
    return pages
      .filter((p) => p.is_problem_page || p.force_ocr)
      .map((p) => p.imageUrl)
      .filter((url): url is string => Boolean(url));
  }, [pages]);

  // 서술형 포함 여부 — OCRProblem 의 number 문자열에 "서술형" 포함 여부
  const hasEssay = useMemo(() => {
    return problems.some(
      (p) =>
        typeof p.number === "string" &&
        (p.number as string).includes("서술형"),
    );
  }, [problems]);

  // 학년 — DB enum (middle1 등) → 한국어 (중1 등). mathlab prompt 가 한국어 키 사용.
  const koreanGrade = useMemo(() => toKoreanGrade(grade), [grade]);

  const [subTab, setSubTab] = useState<StatsSubTab>("basic");
  const [reanalyzeOpen, setReanalyzeOpen] = useState(false);

  const { record, inflight, error, trigger, triggerV4, v4Inflight, clearError } =
    useExamAnalysis({
    testId,
    pageImages,
    grade: koreanGrade,
    examCategory: null, // TODO: Phase J 메타 추출 후 wizardStore.testMeta 에서
    hasEssay,
    examScope: null,
  });

  // 1. fetch 진행 중 — record === undefined
  if (record === undefined && !inflight) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted text-small">
        불러오는 중
      </div>
    );
  }

  // 2. 분석 없음 — "분석 시작" CTA
  if (record === null) {
    return (
      <Card className="text-center py-12">
        <div className="w-14 h-14 mx-auto rounded-full bg-accent-soft grid place-items-center mb-4">
          <Icon
            name="chart-bar"
            size={26}
            className="text-accent"
            weight="bold"
          />
        </div>
        <div className="text-h3 text-text">시험지 분석</div>
        <p className="text-small text-muted mt-2 max-w-md mx-auto leading-relaxed">
          단원 분포 · 난이도 · 배점 · 출제 의도를 분석합니다.
        </p>
        {error && (
          <div className="mt-4 mx-auto max-w-md flex items-start gap-2 rounded-r2 bg-danger-soft border border-[#FEE2E2] text-danger text-caption px-3 py-2 text-left">
            <Icon
              name="warning-circle"
              size={14}
              weight="fill"
              className="flex-shrink-0 mt-px"
            />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-danger hover:underline"
            >
              ✕
            </button>
          </div>
        )}
        <div className="mt-5 flex justify-center">
          <Btn
            kind="accent"
            size="lg"
            icon="sparkle"
            disabled={inflight || pageImages.length === 0}
            onClick={() => trigger()}
          >
            {inflight
              ? "분석 중"
              : pageImages.length === 0
                ? "페이지 이미지 없음"
                : "분석 시작"}
          </Btn>
        </div>
        {pageImages.length > 0 && (
          <p className="text-caption text-muted mt-3">
            대상: {pageImages.length}개 페이지 · 학년 {koreanGrade}
            {hasEssay ? " · 서술형 포함" : ""}
          </p>
        )}
      </Card>
    );
  }

  // 3. 분석 in-flight (재분석 중) — spinner
  if (inflight && record) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <div className="text-text font-[550]">분석 중</div>
      </div>
    );
  }

  if (!record) return null;
  const { summary, exam_info, questions } = record;

  // 4. 분석 결과 — 4 차트 + 표
  return (
    <div className="space-y-5">
      {/* 헤더 — 컴팩트 1 row: 좌(요약+chip+숫자) / 우(Level + 재분석) */}
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* 좌측: Eyebrow + 신뢰도 chip + 학교명 + 총문항/배점 */}
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            <div className="flex items-center gap-2">
              <Eyebrow icon="chart-bar">분석 요약</Eyebrow>
              <ConfidenceChip questions={questions} />
            </div>
            {exam_info.school_name && (
              <span className="text-small text-text2 font-[550] truncate">
                {exam_info.school_name}
              </span>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-h3 font-mono text-text">
                  {exam_info.total_questions}
                </span>
                <span className="text-caption text-muted">문항</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-h3 font-mono text-text">
                  {exam_info.total_points}
                </span>
                <span className="text-caption text-muted">점</span>
              </div>
            </div>
          </div>

          {/* 우측: Level chip + 재분석 (인라인) */}
          <div className="flex items-center gap-3 shrink-0">
            <DifficultyLevelChip summary={summary} />
            <Btn
              kind="ghost"
              size="sm"
              icon="arrow-clockwise"
              disabled={inflight}
              onClick={() => setReanalyzeOpen(true)}
            >
              재분석
            </Btn>
          </div>
        </div>
        {/* 신뢰도 색 범례 — 우측 한 줄 (border 분리 X) */}
        <div className="mt-2 flex justify-end">
          <ConfidenceLegend />
        </div>
      </Card>

      {/* Sub-tab navigation */}
      <Segmented<StatsSubTab>
        value={subTab}
        onChange={setSubTab}
        options={SUB_TAB_OPTIONS}
        full
      />

      {/* === 기본 분석 === */}
      {subTab === "basic" && (
        <>
          {/* AI 시험 총평 (Phase N+3) */}
          <AICommentaryCard
            commentary={record.commentary}
            inflight={inflight}
          />

          {/* 4 차트 — grid 2x2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <Eyebrow icon="chart-pie">난이도 분포</Eyebrow>
              <div className="mt-3">
                <DifficultyDonut data={summary.difficulty_distribution} />
              </div>
            </Card>
            <Card>
              <Eyebrow icon="chart-bar">단원 영역 분포</Eyebrow>
              <div className="mt-3">
                <UnitBarChart data={summary.type_distribution} />
              </div>
            </Card>
            <Card>
              <Eyebrow icon="polygon">사고력 영역</Eyebrow>
              <div className="mt-3">
                <DomainRadar data={summary.domain_distribution} />
              </div>
            </Card>
            <Card>
              <Eyebrow icon="list-checks">문항 형식</Eyebrow>
              <div className="mt-3 space-y-3">
                {(["objective", "short_answer", "essay"] as const).map((fmt) => {
                  const count = exam_info.format_distribution[fmt];
                  const total = exam_info.total_questions || 1;
                  const pct = Math.round((count / total) * 100);
                  const labels = { objective: "객관식", short_answer: "단답형", essay: "서술형" };
                  const colors = { objective: "#0EA5E9", short_answer: "#8B5CF6", essay: "#F59E0B" };
                  return (
                    <div key={fmt}>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-small text-text2">{labels[fmt]}</span>
                        <span className="text-small font-mono text-text">
                          {count}문항{" "}
                          <span className="text-muted">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 bg-surface2 rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: colors[fmt],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* 서술형 집중 분석 */}
          <EssayAnalysisSection
            questions={questions}
            totalQuestions={exam_info.total_questions}
            totalPoints={exam_info.total_points}
          />

          {/* 문항별 배점 차트 */}
          <QuestionPointsChart questions={questions} />

          {/* 변별력 분석 */}
          <DiscriminationSection questions={questions} />
        </>
      )}

      {/* === AI 코멘트 === */}
      {subTab === "comment" && <AnalysisCommentSection questions={questions} />}

      {/* === 학습 대책 === */}
      {subTab === "strategy" && (
        <StudyStrategySection
          questions={questions}
          commentary={record.commentary}
        />
      )}

      {/* === 학원 블로그 (V4) — Phase N+5 비활성 (V4_BLOG_ENABLED) === */}
      {subTab === "v4" && (
        <V4BlogView
          commentary={record.commentary}
          meta={
            {
              examTitle: exam_info.school_name
                ? `${exam_info.school_name} ${koreanGrade}`
                : `${koreanGrade} 시험 분석`,
              schoolName: exam_info.school_name ?? null,
              grade: koreanGrade,
              analyzedAt: record.created_at ?? null,
              academyName: null,
            } satisfies V4Meta
          }
          onGenerate={triggerV4}
          generating={v4Inflight}
        />
      )}

      {/* 재분석 옵션 모달 (Phase N+6) — 주변/연도 비교 메모 입력 */}
      <ReanalyzeModal
        open={reanalyzeOpen}
        onClose={() => setReanalyzeOpen(false)}
        onConfirm={(opts) => {
          setReanalyzeOpen(false);
          trigger(opts);
        }}
      />
    </div>
  );
};

export default StatsTabContent;
