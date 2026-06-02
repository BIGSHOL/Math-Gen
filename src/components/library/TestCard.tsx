import { Card, Chip, Icon, type ChipTone } from "@app/components/ui";
import { useExamAnalysisStore } from "@app/stores/examAnalysisStore";
import type { TestPaper, TestStatus } from "@app/types";

export interface TestCardProps {
  test: TestPaper;
  onClick?: () => void;
  /** 삭제 핸들러 — 주어지면 hover 시 좌상단 삭제 버튼 노출. */
  onDelete?: () => void;
}

const STATUS_CHIP_TONE: Record<TestStatus, ChipTone> = {
  ok: "ok",
  warn: "warn",
  draft: "neutral",
};

// 위자드 단계 라벨 — furthest_step(0~6) → 한글. 목록 카드 진행단계 칩.
const WIZARD_STEP_LABELS = [
  "업로드",
  "검수",
  "OCR",
  "해설",
  "옵션",
  "검토",
  "내보내기",
] as const;

const TYPE_KO: Record<string, string> = {
  number: "수와 연산",
  algebra: "대수",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

/**
 * Library grid card — mirrors `TestCardHF` from hifi/library.jsx.
 *
 * Layout:
 *  - 132px header: gradient panel with a faux "mini paper" preview that
 *    renders three lined rows. Pure CSS — no real document image.
 *  - Status chip pinned to the top-right of the header.
 *  - Meta block: title (h3, single-line ellipsis) + footer row with
 *    문항 count on the left and the "time" string on the right.
 */
export const TestCard = ({ test, onClick, onDelete }: TestCardProps) => {
  // Phase N-6: 분석 결과 있으면 dominant_type chip 표시 (LibraryScreen 이 batch fetch).
  const analysis = useExamAnalysisStore((s) => s.byTest[test.id]);
  const dominantTopic = analysis?.summary?.dominant_type
    ? TYPE_KO[analysis.summary.dominant_type] ?? analysis.summary.dominant_type
    : null;
  const avgDifficulty = analysis?.summary?.average_difficulty;

  return (
  <Card pad={0} interactive onClick={onClick} className="overflow-hidden group relative">
    {/* 삭제 버튼 — hover 시 좌상단. onClick (openTest) 와 격리. */}
    {onDelete && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="시험지 삭제"
        title="시험지 삭제"
        className="absolute top-2 left-2 z-20 w-7 h-7 rounded-full bg-white/90 shadow-s1 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger-soft"
      >
        <Icon name="trash" size={14} className="text-danger" />
      </button>
    )}
    {/* Header — mini paper preview */}
    <div
      className="relative h-[132px] border-b border-line overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #F4F5F7, #FAFBFC)",
      }}
    >
      <div
        className="absolute left-6 right-6 top-3 bg-white px-3 py-2.5"
        style={{
          borderRadius: "3px 3px 0 0",
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          fontSize: 5.5,
          lineHeight: 1.4,
        }}
      >
        <div
          className="font-semibold text-text"
          style={{
            fontSize: 6.5,
            marginBottom: 3,
            paddingBottom: 2,
            borderBottom: "0.6px solid #0F1117",
          }}
        >
          수학영역
        </div>
        {[1, 2, 3].map((n) => (
          <div key={n} className="mt-1">
            <div className="flex gap-0.5 items-baseline">
              <span className="font-semibold">{n}.</span>
              <div className="flex-1 bg-surface3 rounded-[1px]" style={{ height: 2 }} />
            </div>
            <div className="ml-1.5 mt-1 flex flex-col gap-[1px]">
              <div className="bg-surface2 rounded-[1px]" style={{ height: 1.5, width: "75%" }} />
              {n === 2 && (
                <div className="bg-surface2 rounded-[1px] my-0.5" style={{ height: 10, width: "60%" }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="absolute top-2 right-2">
        <Chip tone={STATUS_CHIP_TONE[test.status]} size="sm" dot>
          {test.statusText}
        </Chip>
      </div>
    </div>

    {/* Meta */}
    <div className="px-3.5 py-3">
      <div className="text-h3 text-text overflow-hidden text-ellipsis whitespace-nowrap mb-1">
        {test.title}
      </div>
      <div className="flex justify-between text-small text-muted whitespace-nowrap">
        <span className="flex items-center gap-1">
          <Icon name="article" size={12} />
          {test.problemCount}문항
        </span>
        <span>{test.time}</span>
      </div>
      {/* 진행단계 chip (furthest_step 있을 때) + 분석 결과 chip */}
      {(typeof test.furthestStep === "number" || dominantTopic) && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {typeof test.furthestStep === "number" && (
            <Chip tone="soft" size="sm" icon="flag">
              {WIZARD_STEP_LABELS[test.furthestStep] ?? "진행"} 단계
            </Chip>
          )}
          {dominantTopic && (
            <Chip tone="accent" size="sm" icon="chart-pie">
              {dominantTopic}
            </Chip>
          )}
          {avgDifficulty && (
            <Chip tone="soft" size="sm">
              난이도 {avgDifficulty}
            </Chip>
          )}
        </div>
      )}
    </div>
  </Card>
  );
};

export default TestCard;
