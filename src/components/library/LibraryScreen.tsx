import { useEffect, useMemo, useRef, useState } from "react";
import { UserMenu } from "@app/components/auth";
import {
  Btn,
  Divider,
  Eyebrow,
  Heading,
  Icon,
  Kbd,
  Logo,
  ModKey,
  Segmented,
  TopBar,
} from "@app/components/ui";
import {
  collectionsPresent,
  countByCollection,
  gradesPresent,
  matchesCollection,
  matchesGrade,
  matchesQuery,
  matchesTags,
  sortTests,
  topTagsByFrequency,
  type Collection,
  type GradeKey,
  type SortKey,
} from "@app/lib/libraryFilter";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { LibrarySidebar } from "./LibrarySidebar";
import { StatsStrip } from "./StatsStrip";
import { TestGrid } from "./TestGrid";
import { TestList } from "./TestList";

type ViewKey = "grid" | "list";

/**
 * TopBar 좌측 페이지 nav. `on:false` 는 *미구현 페이지* — disabled 처리 +
 * "준비 중" tooltip. 클릭해도 효과 없음 명시 (이전엔 onClick 누락 → silent
 * no-op 으로 사용자 혼란).
 */
const TOP_NAV = [
  { t: "내 시험지", icon: "books", on: true, hint: undefined },
  { t: "변환 작업", icon: "lightning", on: false, hint: "준비 중 — 변환 진행 페이지" },
  { t: "단원 자료", icon: "graduation-cap", on: false, hint: "준비 중 — 단원별 자료 라이브러리" },
] as const;

/**
 * Library shell — TopBar + sidebar + main content grid.
 *
 * Hydrates the library store on mount (Supabase 우선, MOCK fallback).
 *
 * **필터링 / 정렬 — controlled state 한 곳**: collection / grade / selectedTags
 * / sort 모두 LibraryScreen 이 보유. useMemo 로 derived `filteredTests` →
 * `sortedTests` 계산 후 TestGrid / TestList 에 전달. Sidebar 는 props 만
 * 받는 dumb 컴포넌트.
 *
 * **카운트** — 컬렉션 / 학년 / 태그 모두 *현재 tests 배열* 기반 실시간 계산.
 * 이전 hardcoded 47/12/8 같은 mock 값 제거 (mock 데이터 size 와 불일치 함정).
 */
export const LibraryScreen = () => {
  const tests = useLibraryStore((s) => s.tests);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const openTest = useAppStore((s) => s.openTest);
  const startWizard = useAppStore((s) => s.startWizard);

  const [collection, setCollection] = useState<Collection>("전체");
  const [grade, setGrade] = useState<GradeKey | undefined>(undefined);
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewKey>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Ctrl/Cmd+K → 검색 focus, Esc → 검색 clear + blur.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (
        e.key === "Escape" &&
        document.activeElement === searchInputRef.current
      ) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Sidebar 카탈로그 — 전체 tests 기준 (필터 적용 *전*). 카운트 0 컬렉션 /
  // 데이터에 없는 학년은 자동 숨김 (mock vs 실 데이터 mismatch 함정 회피).
  const collectionCounts = useMemo(() => countByCollection(tests), [tests]);
  const visibleCollections = useMemo(() => {
    const ids = collectionsPresent(collectionCounts);
    const META: Record<Collection, { label: string; icon: string }> = {
      "전체": { label: "전체", icon: "stack" },
      "모의평가": { label: "모의평가", icon: "chart-line" },
      "수능 기출": { label: "수능 기출", icon: "exam" },
      "학교 시험": { label: "학교 시험", icon: "buildings" },
      "내가 만든 변형": { label: "내가 만든 변형", icon: "sparkle" },
    };
    return ids.map((id) => ({
      id,
      label: META[id].label,
      icon: META[id].icon,
      count: collectionCounts[id] ?? 0,
    }));
  }, [collectionCounts]);
  const gradeOptions = useMemo(() => gradesPresent(tests), [tests]);
  const tagOptions = useMemo(() => topTagsByFrequency(tests, 8), [tests]);
  const totalProblems = useMemo(
    () => tests.reduce((sum, t) => sum + (t.problemCount ?? 0), 0),
    [tests],
  );

  // Filter chain: collection → grade → tags → query. Sort 마지막.
  const filteredTests = useMemo(
    () =>
      tests.filter(
        (t) =>
          matchesCollection(t, collection) &&
          matchesGrade(t, grade) &&
          matchesTags(t, selectedTags) &&
          matchesQuery(t, searchQuery),
      ),
    [tests, collection, grade, selectedTags, searchQuery],
  );
  const sortedTests = useMemo(
    () => sortTests(filteredTests, sort),
    [filteredTests, sort],
  );

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  // 사이드바 라벨 (헤더 제목용) — 컬렉션 우선, 학년/태그/검색 있으면 부제로.
  const filterSummary = (() => {
    const parts: string[] = [];
    if (grade) parts.push(grade);
    if (selectedTags.size > 0) {
      parts.push(
        Array.from(selectedTags).map((t) => `#${t}`).join(" "),
      );
    }
    if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
    return parts.length > 0 ? parts.join(" · ") : null;
  })();

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <TopBar
        left={
          <>
            <Logo />
            <Divider vertical className="h-5" />
            <nav className="flex gap-0.5">
              {TOP_NAV.map((n) => {
                const disabled = !n.on;
                return (
                  <button
                    key={n.t}
                    type="button"
                    disabled={disabled}
                    title={n.hint}
                    className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-r1 text-[13px] font-[550] whitespace-nowrap transition-colors ${
                      n.on
                        ? "text-text bg-surface2 cursor-default"
                        : "text-muted-soft bg-transparent cursor-not-allowed opacity-60"
                    }`}
                  >
                    <Icon
                      name={n.icon}
                      size={14}
                      weight={n.on ? "fill" : "regular"}
                    />
                    {n.t}
                  </button>
                );
              })}
            </nav>
          </>
        }
        right={
          <>
            <div
              className={`flex items-center gap-2 pl-2 pr-2.5 h-[30px] bg-surface2 rounded-r2 text-[12.5px] min-w-[260px] border transition-all duration-[140ms] ${
                searchFocus
                  ? "border-accent shadow-accent-glow"
                  : "border-transparent"
              }`}
            >
              <Icon
                name="magnifying-glass"
                size={14}
                className={searchFocus || searchQuery ? "text-text2" : "text-muted"}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setSearchFocus(false)}
                placeholder="시험지 검색…"
                aria-label="시험지 검색"
                className="flex-1 bg-transparent border-none outline-none text-text placeholder:text-muted min-w-0"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  className="flex-shrink-0 p-0.5 rounded-r1 text-muted hover:text-text hover:bg-hover transition-colors"
                  aria-label="검색어 지우기"
                >
                  <Icon name="x" size={12} />
                </button>
              ) : (
                <>
                  <ModKey />
                  <Kbd>K</Kbd>
                </>
              )}
            </div>
            <Btn
              kind="ghost"
              size="sm"
              icon="bell-simple"
              aria-label="알림"
              disabled
              title="알림 — 준비 중"
            />
            <Btn
              kind="accent"
              size="sm"
              icon="plus"
              onClick={() => startWizard("")}
            >
              새 변환
            </Btn>
            <UserMenu />
          </>
        }
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <LibrarySidebar
          collection={collection}
          onCollectionChange={setCollection}
          grade={grade}
          onGradeChange={setGrade}
          selectedTags={selectedTags}
          onTagToggle={toggleTag}
          visibleCollections={visibleCollections}
          gradeOptions={gradeOptions}
          tagOptions={tagOptions}
          totalProblems={totalProblems}
          totalTests={tests.length}
        />

        <main className="flex-1 overflow-auto min-w-0">
          {/* 2400px 캡 — 1920·2560 (2K) 모니터까지 자연스럽게 활용하고,
              4K (3840) 같은 초대형 디스플레이에서는 좌우 여백으로 가독성
              확보. 1920 에선 사이드바 제외 ~1700 폭을 모두 카드 그리드로
              씀 (6 열). 2K 에선 8 열 자연 분기. */}
          <div className="px-9 py-7 max-w-[2400px] min-w-0">
            <Heading
              level="h1"
              sub={
                filterSummary
                  ? `${sortedTests.length}개 · ${filterSummary}`
                  : `${sortedTests.length}개 · 전체 ${tests.length}개`
              }
              right={
                <>
                  <Segmented<SortKey>
                    value={sort}
                    onChange={setSort}
                    size="sm"
                    options={[
                      { value: "recent", label: "최근순" },
                      { value: "name", label: "이름순" },
                      { value: "status", label: "상태별" },
                    ]}
                  />
                  <Segmented<ViewKey>
                    value={view}
                    onChange={setView}
                    size="sm"
                    options={[
                      { value: "grid", label: "", icon: "squares-four" },
                      { value: "list", label: "", icon: "list" },
                    ]}
                  />
                </>
              }
            >
              {collection}
            </Heading>

            <div className="mt-[22px]">
              <StatsStrip tests={tests} />
            </div>

            <div className="mt-7 mb-3 flex items-center justify-between">
              <Eyebrow icon="clock-counter-clockwise">최근 작업</Eyebrow>
              <span className="text-small text-muted">
                {sortedTests.length}개 표시
              </span>
            </div>

            {sortedTests.length === 0 ? (
              <div className="rounded-r3 border border-dashed border-line bg-surface px-6 py-12 text-center">
                <Icon
                  name="folder-open"
                  size={28}
                  className="text-muted mx-auto mb-2"
                />
                <div className="text-text font-[550]">
                  조건에 맞는 시험지가 없습니다
                </div>
                <p className="text-small text-muted mt-1">
                  컬렉션 / 학년 / 태그 필터를 조정해보세요.
                </p>
              </div>
            ) : view === "grid" ? (
              <TestGrid tests={sortedTests} onSelect={openTest} />
            ) : (
              <TestList tests={sortedTests} onSelect={openTest} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default LibraryScreen;
