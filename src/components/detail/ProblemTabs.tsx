import type { ReactNode } from "react";
import { Icon } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";

export type DetailTab = "problems" | "solutions" | "stats" | "history";

export interface ProblemTabsProps {
  active: DetailTab;
  onChange: (next: DetailTab) => void;
  /** Optional badge counts per tab — e.g. {problems: 30, solutions: 30}. */
  counts?: Partial<Record<DetailTab, number>>;
}

interface TabSpec {
  id: DetailTab;
  label: string;
  icon: string;
}

const TABS: TabSpec[] = [
  { id: "problems", label: "문항", icon: "list-numbers" },
  { id: "solutions", label: "해설", icon: "book-open" },
  { id: "stats", label: "통계", icon: "chart-bar" },
  { id: "history", label: "변형 이력", icon: "git-branch" },
];

/**
 * Underline-style tab bar. Active tab gets a 2px ink-colored bottom border
 * and fill-weight icon. Mirrors the tab bar in hifi/detail.jsx.
 */
export const ProblemTabs = ({ active, onChange, counts }: ProblemTabsProps) => (
  <div className="flex border-b border-line gap-1" role="tablist">
    {TABS.map((t) => {
      const on = t.id === active;
      const count = counts?.[t.id];
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={on}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-3.5 py-2.5 border-0 bg-transparent cursor-pointer whitespace-nowrap text-[13.5px]",
            "transition-colors duration-[120ms]",
            "focus-visible:outline-none focus-visible:bg-hover rounded-t",
            on
              ? "text-text font-semibold border-b-2 border-text -mb-px"
              : "text-muted font-medium border-b-2 border-transparent -mb-px hover:text-text2",
          )}
        >
          <Icon name={t.icon} size={14} weight={on ? "fill" : "regular"} />
          {t.label}
          {count !== undefined && (
            <span className="text-caption text-muted font-mono">{count}</span>
          )}
        </button>
      );
    })}
  </div>
);

/** Placeholder used by tabs that don't have content yet. */
export const TabPlaceholder = ({ icon, message }: { icon: string; message: ReactNode }) => (
  <div className="py-12 text-center text-body text-muted">
    <Icon name={icon} size={36} weight="duotone" color="#9CA3AF" />
    <div className="mt-2.5">{message}</div>
  </div>
);

export default ProblemTabs;
