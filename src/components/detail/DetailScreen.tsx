import { useState } from "react";
import {
  Btn,
  Chip,
  Divider,
  Icon,
  TopBar,
  type ChipTone,
} from "@app/components/ui";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import type { TestStatus } from "@app/types";
import { PageThumbnails } from "./PageThumbnails";
import { HeroCard } from "./HeroCard";
import { ProblemTabs, TabPlaceholder, type DetailTab } from "./ProblemTabs";
import { DetailMetaSidebar } from "./DetailMetaSidebar";
import { CtaBanner } from "./CtaBanner";

const STATUS_CHIP_TONE: Record<TestStatus, ChipTone> = {
  ok: "ok",
  warn: "warn",
  draft: "neutral",
};

/**
 * Detail screen — TopBar (with back nav) + page thumbnails sidebar + main
 * content + metadata sidebar.
 *
 * If the selected test id can't be resolved we render an empty fallback
 * with a "보관함으로" button rather than crashing. That can happen e.g. if
 * the user deep-linked into a stale id.
 */
export const DetailScreen = () => {
  const selectedTestId = useAppStore((s) => s.selectedTestId);
  const backToLibrary = useAppStore((s) => s.backToLibrary);
  const openModal = useAppStore((s) => s.openModal);
  const getTest = useLibraryStore((s) => s.getTest);

  const test = selectedTestId ? getTest(selectedTestId) : undefined;

  const [activeTab, setActiveTab] = useState<DetailTab>("problems");
  const [activePage, setActivePage] = useState(1);

  if (!test) {
    return (
      <div className="w-full h-full flex flex-col bg-bg">
        <TopBar
          left={
            <Btn kind="ghost" size="sm" icon="arrow-left" onClick={backToLibrary}>
              보관함
            </Btn>
          }
        />
        <div className="flex-1 grid place-items-center text-body text-muted">
          선택한 시험지를 찾을 수 없습니다.
        </div>
      </div>
    );
  }

  // Stub page count until real page data lands in Phase 4.
  const pageCount = 8;

  return (
    <div className="w-full h-full flex flex-col bg-bg">
      <TopBar
        left={
          <>
            <Btn kind="ghost" size="sm" icon="arrow-left" onClick={backToLibrary}>
              보관함
            </Btn>
            <Divider vertical className="h-[18px]" />
            <div className="flex items-center gap-2 text-body min-w-0 whitespace-nowrap overflow-hidden">
              <span className="text-muted">내 시험지</span>
              <Icon name="caret-right" size={11} color="#9CA3AF" />
              <span
                className="text-text font-semibold overflow-hidden text-ellipsis"
                style={{ maxWidth: 280 }}
              >
                {test.title}
              </span>
              <Chip tone={STATUS_CHIP_TONE[test.status]} size="sm" dot>
                {test.statusText}
              </Chip>
            </div>
          </>
        }
        right={
          <>
            <Btn kind="ghost" size="sm" icon="share-network">
              공유
            </Btn>
            <Btn kind="secondary" size="sm" icon="download-simple">
              PDF
            </Btn>
            <Btn
              kind="accent"
              size="sm"
              icon="sparkle"
              onClick={() => openModal("new-variant")}
            >
              변형 만들기
            </Btn>
          </>
        }
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <PageThumbnails
          pageCount={pageCount}
          activePage={activePage}
          onSelect={setActivePage}
        />

        <main className="flex-1 overflow-auto px-8 py-6">
          <HeroCard test={test} />

          <div className="mt-[22px] mb-5">
            <ProblemTabs
              active={activeTab}
              onChange={setActiveTab}
              counts={{
                problems: test.problemCount,
                solutions: test.problemCount,
                history: test.variants.length,
              }}
            />
          </div>

          {activeTab === "problems" && (
            <TabPlaceholder
              icon="list-numbers"
              message="문항 미리보기는 Phase 4 wizard에서 디지털화한 뒤 표시됩니다."
            />
          )}
          {activeTab === "solutions" && (
            <TabPlaceholder icon="book-open" message="해설지 탭 (Phase 4에서 연결)" />
          )}
          {activeTab === "stats" && (
            <TabPlaceholder icon="chart-bar" message="통계 탭 (mock)" />
          )}
          {activeTab === "history" && (
            <TabPlaceholder
              icon="git-branch"
              message={
                test.variants.length
                  ? `변형 이력 ${test.variants.length}건 — 우측 사이드바를 확인하세요.`
                  : "아직 생성된 변형이 없습니다."
              }
            />
          )}

          <CtaBanner onLaunch={() => openModal("new-variant")} />
        </main>

        <DetailMetaSidebar test={test} />
      </div>
    </div>
  );
};

export default DetailScreen;
