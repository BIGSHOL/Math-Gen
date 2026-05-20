import type { TestPaper } from "@app/types";
import { TestCard } from "./TestCard";

export interface TestGridProps {
  tests: TestPaper[];
  onSelect: (id: string) => void;
}

/**
 * Responsive auto-fill grid of TestCards. Mirrors the grid layout from
 * hifi/library.jsx — `repeat(auto-fill, minmax(232px, 1fr))` gives roughly
 * 5 columns at 1280px and re-flows down to 1 column on small viewports.
 */
export const TestGrid = ({ tests, onSelect }: TestGridProps) => (
  <div
    className="grid gap-3.5"
    style={{ gridTemplateColumns: "repeat(auto-fill, minmax(232px, 1fr))" }}
  >
    {tests.map((t) => (
      <TestCard key={t.id} test={t} onClick={() => onSelect(t.id)} />
    ))}
  </div>
);

export default TestGrid;
