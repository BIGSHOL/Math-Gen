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
}

const GRID_COLS = "1fr 80px 140px 110px 88px 24px";

/**
 * List view alternative to TestGrid. Mirrors the table from
 * hifi/library.jsx with the same 6-column layout.
 */
export const TestList = ({ tests, onSelect }: TestListProps) => (
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
      <button
        key={t.id}
        type="button"
        onClick={() => onSelect(t.id)}
        className="grid gap-3 items-center px-4 py-3 border-b border-line cursor-pointer transition-colors duration-[100ms] hover:bg-hover w-full text-left last:border-b-0 focus-visible:outline-none focus-visible:bg-hover"
        style={{ gridTemplateColumns: GRID_COLS }}
      >
        <span className="text-body text-text font-[550] truncate">{t.title}</span>
        <span className="text-small text-muted font-mono">{t.problemCount}</span>
        <span className="text-small text-text2 truncate">{t.subject}</span>
        <Chip tone={STATUS_CHIP_TONE[t.status]} size="sm" dot>
          {t.statusText}
        </Chip>
        <span className="text-small text-muted">{t.time}</span>
        <Icon name="caret-right" size={12} color="#9CA3AF" />
      </button>
    ))}
  </Card>
);

export default TestList;
