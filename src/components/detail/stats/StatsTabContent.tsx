import { useMemo } from "react";
import { Btn, Card, Eyebrow, Icon } from "@app/components/ui";
import { useExamAnalysis } from "@app/hooks/useExamAnalysis";
import type { PageWithUrls } from "@app/hooks/useDetailData";
import type { OCRProblem } from "@app/stores/wizardStore";
import { DifficultyDonut } from "./DifficultyDonut";
import { UnitBarChart } from "./UnitBarChart";
import { DomainRadar } from "./DomainRadar";
import { QuestionTable } from "./QuestionTable";

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
 *
 * 비용 추정: ~$0.05~0.10/시험지 (cache hit ratio 따라).
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

  const { record, inflight, error, trigger, clearError } = useExamAnalysis({
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
        분석 결과를 불러오는 중...
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
          AI가 시험지의 단원별 분포 · 난이도 구성 · 배점 · 출제 의도를 분석합니다.
          분석에는 약 30~60초 소요됩니다 (~$0.05~0.10).
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
            onClick={trigger}
          >
            {inflight
              ? "분석 중..."
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
        <div className="text-text font-[550]">시험지 분석 중...</div>
        <div className="text-caption text-muted">약 30~60초 소요</div>
      </div>
    );
  }

  if (!record) return null;
  const { summary, exam_info, questions } = record;

  // 4. 분석 결과 — 4 차트 + 표
  return (
    <div className="space-y-5">
      {/* 헤더 — 시험지 메타 + 재분석 버튼 */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow icon="chart-bar">분석 요약</Eyebrow>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-caption text-muted">총 문항</div>
                <div className="text-h3 font-mono text-text">
                  {exam_info.total_questions}
                </div>
              </div>
              <div>
                <div className="text-caption text-muted">총 배점</div>
                <div className="text-h3 font-mono text-text">
                  {exam_info.total_points}
                  <span className="text-small text-muted ml-1">점</span>
                </div>
              </div>
              <div>
                <div className="text-caption text-muted">평균 난이도</div>
                <div className="text-h3 font-mono text-text">
                  {summary.average_difficulty}
                  <span className="text-small text-muted ml-1">단계</span>
                </div>
              </div>
              <div>
                <div className="text-caption text-muted">학교명</div>
                <div className="text-[14px] text-text font-[550] truncate">
                  {exam_info.school_name ?? "—"}
                </div>
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <Btn
              kind="ghost"
              size="sm"
              icon="arrow-clockwise"
              disabled={inflight}
              onClick={() => {
                if (window.confirm("이 시험지를 다시 분석합니다. 계속하시겠습니까?")) {
                  trigger();
                }
              }}
            >
              재분석
            </Btn>
            <div className="text-caption text-muted">
              {record.input_page_count}페이지 · {record.model}
            </div>
          </div>
        </div>
      </Card>

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

      {/* 문항 표 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Eyebrow icon="table">문항별 상세 분석</Eyebrow>
          <span className="text-small text-muted">
            행 클릭 시 ai_comment + 사고력 표시
          </span>
        </div>
        <QuestionTable questions={questions} />
      </div>
    </div>
  );
};

export default StatsTabContent;
