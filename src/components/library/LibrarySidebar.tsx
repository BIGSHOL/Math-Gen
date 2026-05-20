import { useState } from "react";
import { Chip, Eyebrow, Icon, NavList, Progress } from "@app/components/ui";

export type Collection = "전체" | "모의평가" | "수능 기출" | "학교 시험" | "내가 만든 변형";

export interface LibrarySidebarProps {
  collection: Collection;
  onCollectionChange: (next: Collection) => void;
}

const COLLECTIONS: { id: Collection; label: string; icon: string; count: number }[] = [
  { id: "전체", label: "전체", icon: "stack", count: 47 },
  { id: "모의평가", label: "모의평가", icon: "chart-line", count: 12 },
  { id: "수능 기출", label: "수능 기출", icon: "exam", count: 8 },
  { id: "학교 시험", label: "학교 시험", icon: "buildings", count: 18 },
  { id: "내가 만든 변형", label: "내가 만든 변형", icon: "sparkle", count: 9 },
];

const GRADES = [
  { id: "고1", label: "고1", icon: "circle", count: 12 },
  { id: "고2", label: "고2", icon: "circle", count: 18 },
  { id: "고3 · 재수", label: "고3 · 재수", icon: "circle-half", count: 17 },
];

const TAGS = ["미적분", "확통", "기하", "공통수학1", "수능 직전"];

/**
 * Library left sidebar — collections, grade filters, tag chips, usage card.
 *
 * For now, only the collection picker is wired up; grade filter and tags
 * are display-only (Phase 2 mock). Grade-driven filtering lands in the
 * Phase 6 backend rewrite.
 */
export const LibrarySidebar = ({ collection, onCollectionChange }: LibrarySidebarProps) => {
  const [grade, setGrade] = useState<string | undefined>(undefined);

  return (
    <aside className="w-[232px] flex-shrink-0 px-3.5 py-[18px] border-r border-line bg-surface overflow-auto">
      <Eyebrow className="mb-2 pl-2">컬렉션</Eyebrow>
      <NavList items={COLLECTIONS} current={collection} onChange={onCollectionChange} />

      <div className="mt-[22px]">
        <Eyebrow className="mb-2 pl-2">학년</Eyebrow>
        <NavList items={GRADES} current={grade} onChange={setGrade} />
      </div>

      <div className="mt-[22px] pl-2">
        <Eyebrow className="mb-2">태그</Eyebrow>
        <div className="flex flex-wrap gap-1">
          {TAGS.map((t) => (
            <Chip key={t} tone="soft" size="sm">
              #{t}
            </Chip>
          ))}
        </div>
      </div>

      {/* Usage card */}
      <div className="mt-7 p-3 bg-surface2 rounded-r3 border border-line">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon name="lightning" size={13} color="#0EA5E9" weight="fill" />
          <span className="text-caption text-text">이번 달 사용</span>
        </div>
        <div className="text-h3 font-mono text-text">
          318 <span className="text-muted font-normal">/ 2,000</span>
        </div>
        <div className="mt-2">
          <Progress value={318} max={2000} tone="accent" height={3} />
        </div>
      </div>
    </aside>
  );
};

export default LibrarySidebar;
