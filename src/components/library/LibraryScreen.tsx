import { useEffect, useState } from "react";
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
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { LibrarySidebar, type Collection } from "./LibrarySidebar";
import { StatsStrip } from "./StatsStrip";
import { TestGrid } from "./TestGrid";
import { TestList } from "./TestList";

type SortKey = "recent" | "name" | "status";
type ViewKey = "grid" | "list";

const TOP_NAV = [
  { t: "내 시험지", icon: "books", on: true },
  { t: "변환 작업", icon: "lightning", on: false },
  { t: "단원 자료", icon: "graduation-cap", on: false },
];

/**
 * Library shell — TopBar + sidebar + main content grid.
 *
 * Hydrates the library store on mount (currently from MOCK_TESTS; Phase 2
 * late will swap to IndexedDB without changing this component).
 */
export const LibraryScreen = () => {
  const tests = useLibraryStore((s) => s.tests);
  const hydrated = useLibraryStore((s) => s.hydrated);
  const hydrate = useLibraryStore((s) => s.hydrate);
  const openTest = useAppStore((s) => s.openTest);
  const startWizard = useAppStore((s) => s.startWizard);

  const [collection, setCollection] = useState<Collection>("전체");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<ViewKey>("grid");

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <TopBar
        left={
          <>
            <Logo />
            <Divider vertical className="h-5" />
            <nav className="flex gap-0.5">
              {TOP_NAV.map((n) => (
                <button
                  key={n.t}
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 py-[5px] rounded-r1 cursor-pointer text-[13px] font-[550] whitespace-nowrap transition-colors ${
                    n.on ? "text-text bg-surface2" : "text-muted bg-transparent hover:bg-hover"
                  }`}
                >
                  <Icon name={n.icon} size={14} weight={n.on ? "fill" : "regular"} />
                  {n.t}
                </button>
              ))}
            </nav>
          </>
        }
        right={
          <>
            <div className="flex items-center gap-2 pl-2 pr-2.5 h-[30px] bg-surface2 rounded-r2 text-muted text-[12.5px] min-w-[220px]">
              <Icon name="magnifying-glass" size={14} />
              <span className="flex-1">검색</span>
              <ModKey />
              <Kbd>K</Kbd>
            </div>
            <Btn kind="ghost" size="sm" icon="bell-simple" aria-label="알림" />
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
        <LibrarySidebar collection={collection} onCollectionChange={setCollection} />

        <main className="flex-1 overflow-auto min-w-0">
          {/* 2400px 캡 — 1920·2560 (2K) 모니터까지 자연스럽게 활용하고,
              4K (3840) 같은 초대형 디스플레이에서는 좌우 여백으로 가독성
              확보. 1920 에선 사이드바 제외 ~1700 폭을 모두 카드 그리드로
              씀 (6 열). 2K 에선 8 열 자연 분기. */}
          <div className="px-9 py-7 max-w-[2400px] min-w-0">
            <Heading
              level="h1"
              sub={`${tests.length}개 · 최근 7일 12개 추가`}
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
              <StatsStrip />
            </div>

            <div className="mt-7 mb-3 flex items-center justify-between">
              <Eyebrow icon="clock-counter-clockwise">최근 작업</Eyebrow>
              <span className="text-small text-muted">{tests.length}개 표시</span>
            </div>

            {view === "grid" ? (
              <TestGrid tests={tests} onSelect={openTest} />
            ) : (
              <TestList tests={tests} onSelect={openTest} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default LibraryScreen;
