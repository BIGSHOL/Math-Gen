import { Card, Chip, Icon, type ChipTone } from "@app/components/ui";
import type { TestPaper, TestStatus } from "@app/types";

const STATUS_CHIP_TONE: Record<TestStatus, ChipTone> = {
  ok: "ok",
  warn: "warn",
  draft: "neutral",
};

export interface TestListProps {
  tests: TestPaper[];
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}

const GRID_COLS = "1fr 80px 140px 110px 88px 24px";

/**
 * List view alternative to TestGrid. Mirrors the table from
 * hifi/library.jsx with the same 6-column layout.
 *
 * Row 는 `<div role="button">` — onDelete 가 주는 *내부 삭제 버튼* 과 nested
 * button 충돌 회피 (CLAUDE.md §3-5).
 */
export const TestList = ({ tests, onSelect, onDelete }: TestListProps) => (
  <Card pad={0}>
    <div
      className="grid gap-3 items-center px-4 py-2.5 border-b border-line text-micro uppercase text-muted"
      style={{ gridTemplateColumns: GRID_COLS }}
    >
      <span>제목</span>
      <span>문항</span>
      <span>과목</span>
      <span>상태</span>
      <span>수정</span>
      <span />
    </div>
    {tests.map((t) => (
      <div
        key={t.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(t.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(t.id);
          }
        }}
        className="group grid gap-3 items-center px-4 py-3 border-b border-line cursor-pointer transition-colors duration-[100ms] hover:bg-hover w-full text-left last:border-b-0 focus-visible:outline-none focus-visible:bg-hover"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span className="text-body text-text font-[550] truncate">{t.title}</span>
        <span className="text-small text-muted font-mono">{t.problemCount}</span>
        <span className="text-small text-text2 truncate">{t.subject}</span>
        <Chip tone={STATUS_CHIP_TONE[t.status]} size="sm" dot>
          {t.statusText}
        </Chip>
        <span className="text-small text-muted">{t.time}</span>
        {onDelete ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(t.id);
            }}
            aria-label="시험지 삭제"
            title="시험지 삭제"
            className="grid place-items-center w-6 h-6 rounded-r1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger-soft text-muted hover:text-danger"
          >
            <Icon name="trash" size={13} />
          </button>
        ) : (
          <Icon name="caret-right" size={12} color="#9CA3AF" />
        )}
      </div>
    ))}
  </Card>
);

export default TestList;
