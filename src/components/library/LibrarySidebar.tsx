import { Eyebrow, Icon, NavList } from "@app/components/ui";
import type { Collection, GradeKey } from "@app/lib/libraryFilter";

export type { Collection, GradeKey };

export interface LibrarySidebarProps {
  collection: Collection;
  onCollectionChange: (next: Collection) => void;
  grade: GradeKey | undefined;
  onGradeChange: (next: GradeKey | undefined) => void;
  selectedTags: ReadonlySet<string>;
  onTagToggle: (tag: string) => void;
  /** 노출할 컬렉션 리스트 + 각 카운트 — 데이터 기준 동적 (count=0 컬렉션은 부모가 미포함). */
  visibleCollections: ReadonlyArray<{
    id: Collection;
    label: string;
    icon: string;
    count: number;
  }>;
  /**
   * 노출할 학년 chip — 데이터 기준 동적 (실 grade 값만, 학년 자연 순서).
   *
   * `grade` = 필터 매칭용 raw 값 (DB enum, 예: "middle1").
   * `label` = display (예: "중1"). 영어/한국어 enum 둘 다 같은 chip 으로.
   */
  gradeOptions: ReadonlyArray<{
    grade: string;
    label: string;
    count: number;
    icon: string;
  }>;
  /** 대표 태그 + 카운트 (실시간 계산). */
  tagOptions: ReadonlyArray<{ tag: string; count: number }>;
  /** 사이드바 하단 누적 카드 — 라이브러리 통계 (Phase 6 의 사용량 한도와 별개). */
  totalProblems: number;
  totalTests: number;
}

/**
 * Library 왼쪽 사이드바 — controlled + *데이터 기반 동적 카탈로그*.
 *
 * 이전: COLLECTIONS / GRADES 가 hard-coded 5+3 union → mock 8 개 vs 실
 * 데이터 mismatch (예: 중학교 시험지만 있어도 "고1 0/고2 0/고3 0" chip
 * 군집 노출).
 *
 * 현재: 부모가 *현재 tests 배열* 기준 visibleCollections / gradeOptions /
 * tagOptions 계산해서 props 로 전달. 사이드바는 dumb 렌더링만.
 *
 * **컬렉션 / 학년 / 태그 모두 토글식**: 학년·태그는 같은 값 재선택 시 해제.
 * 컬렉션은 "전체" default 라 항상 1 개 선택 (라디오).
 *
 * **태그 chip 은 자체 `<button>`** — Chip 컴포넌트가 `<span>` 이라 onClick
 * 없음 (CLAUDE.md §13-3). 동일 스타일로 button 직접 구현.
 */
export const LibrarySidebar = ({
  collection,
  onCollectionChange,
  grade,
  onGradeChange,
  selectedTags,
  onTagToggle,
  visibleCollections,
  gradeOptions,
  tagOptions,
  totalProblems,
  totalTests,
}: LibrarySidebarProps) => {
  // 학년 동일 값 재선택 → 해제 (토글 라디오).
  const handleGradeChange = (next: string) => {
    onGradeChange(grade === next ? undefined : next);
  };

  return (
    <aside className="w-[232px] flex-shrink-0 px-3.5 py-[18px] border-r border-line bg-surface overflow-auto">
      <Eyebrow className="mb-2 pl-2">컬렉션</Eyebrow>
      <NavList
        items={visibleCollections.map((c) => ({ ...c }))}
        current={collection}
        onChange={onCollectionChange}
      />

      {gradeOptions.length > 0 && (
        <div className="mt-[22px]">
          <Eyebrow className="mb-2 pl-2">학년</Eyebrow>
          <NavList
            items={gradeOptions.map((g) => ({
              id: g.grade,
              label: g.label,
              icon: g.icon,
              count: g.count,
            }))}
            current={grade}
            onChange={handleGradeChange}
          />
        </div>
      )}

      <div className="mt-[22px] pl-2">
        <Eyebrow className="mb-2">태그</Eyebrow>
        {tagOptions.length === 0 ? (
          <div className="text-caption text-muted px-1">
            표시할 태그 없음
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tagOptions.map(({ tag, count }) => {
              const selected = selectedTags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTagToggle(tag)}
                  className={
                    "inline-flex items-center whitespace-nowrap rounded-full border font-[550] leading-[1.4] px-2 py-0.5 text-[11.5px] gap-1.5 transition-colors cursor-pointer " +
                    (selected
                      ? "bg-accent-soft text-accent-ink border-accent-soft-strong"
                      : "bg-surface text-text2 border-line hover:bg-surface2")
                  }
                  aria-pressed={selected}
                >
                  #{tag}
                  <span className={selected ? "text-accent" : "text-muted"}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {selectedTags.size > 0 && (
          <button
            type="button"
            onClick={() => {
              for (const tag of selectedTags) onTagToggle(tag);
            }}
            className="mt-2 text-caption text-muted hover:text-text underline-offset-2 hover:underline cursor-pointer"
          >
            선택 해제 ({selectedTags.size})
          </button>
        )}
      </div>

      {/* 라이브러리 누적 카드.
        *
        * 이전: 318/2,000 hardcoded (Phase 6 billing 한도). 사용자 구독 한도
        * 추적 인프라 (ai_usage 테이블 + plan 메타) 미구현이라 *현재 시점 의미
        * 있는 정보* 로 교체 — 라이브러리에 누적된 시험지/문항 수.
        *
        * Phase 6 billing 도입 시 별도 한도 chip 추가 (또는 이 카드 자리 교체).
        */}
      <div className="mt-7 p-3 bg-surface2 rounded-r3 border border-line">
        <div className="flex items-center gap-1.5 mb-1">
          <Icon name="stack" size={13} color="#0EA5E9" weight="fill" />
          <span className="text-caption text-text">라이브러리 누적</span>
        </div>
        <div className="text-h3 font-mono text-text">
          {totalProblems.toLocaleString()}
          <span className="text-muted font-normal text-small ml-1">문항</span>
        </div>
        <div className="text-caption text-muted mt-1">
          {totalTests} 시험지 변환
        </div>
      </div>
    </aside>
  );
};

export default LibrarySidebar;
