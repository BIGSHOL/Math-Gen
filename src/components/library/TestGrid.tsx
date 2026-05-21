import type { TestPaper } from "@app/types";
import { TestCard } from "./TestCard";

export interface TestGridProps {
  tests: TestPaper[];
  onSelect: (id: string) => void;
}

/**
 * Responsive auto-fill grid of TestCards.
 *
 * **카드 폭은 항상 260 px 고정**, 행·열 개수만 컨테이너 폭에 따라 분기.
 * `1fr` 분배를 안 쓰는 이유 — 사용자 의도가 "와이드 모니터에서 카드가
 * 가로로 늘어나는 것이 아니라 열 수만 늘어나는 것" 이라서. `auto-fill,
 * 260px` 패턴이 카드 사이즈를 일정하게 유지하면서 1800 px 컨테이너에
 * 6 열, 1280 px 에 4 열, 모바일 1 열로 자동 분기한다.
 *
 * `justify-start` — 마지막 행의 카드가 적게 남으면 그것들을 왼쪽 정렬
 * (CSS Grid 기본인 stretch 가 1fr 없이는 깨질 수 있어 명시).
 */
export const TestGrid = ({ tests, onSelect }: TestGridProps) => (
  <div
    className="grid gap-3.5 justify-start"
    style={{ gridTemplateColumns: "repeat(auto-fill, 260px)" }}
  >
    {tests.map((t) => (
      <TestCard key={t.id} test={t} onClick={() => onSelect(t.id)} />
    ))}
  </div>
);

export default TestGrid;
