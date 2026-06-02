import { useState } from "react";
import {
  Btn,
  Card,
  Chip,
  Divider,
  Icon,
  TopBar,
  type ChipTone,
} from "@app/components/ui";
import MarkdownRenderer, {
  type DiagramSvgItem,
} from "@app/components/math/MarkdownRenderer";
import { OCRItem } from "@app/components/wizard/OCRItem";
import { SolutionItem } from "@app/components/wizard/SolutionItem";
import { renderDiagram, type DiagramParams } from "@app/lib/diagram";
import { useDetailData, type PageWithUrls } from "@app/hooks/useDetailData";
import { useImageAsDataUrl } from "@app/hooks/useImageAsDataUrl";
import { formatRelativeKo, historyRowToVariant } from "@app/services/api/mappers";
import { hydrateWizardFromTest } from "@app/services/api/wizardHydrate";
import { suspendWizardSync } from "@app/services/api/wizardSync";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import type {
  OCRProblem,
  ProblemReview,
  WizardStepIndex,
} from "@app/stores/wizardStore";
import type { TestStatus } from "@app/types";
import { PageThumbnails } from "./PageThumbnails";
import { HeroCard } from "./HeroCard";
import { ProblemTabs, TabPlaceholder, type DetailTab } from "./ProblemTabs";
import { DetailMetaSidebar } from "./DetailMetaSidebar";
import { StatsTabContent } from "./stats/StatsTabContent";
// CtaBanner 는 더 이상 사용 안 함 (DetailMetaSidebar 의 액션 섹션으로 통합).

const STATUS_CHIP_TONE: Record<TestStatus, ChipTone> = {
  ok: "ok",
  warn: "warn",
  draft: "neutral",
};

/**
 * Detail screen — TopBar (with back nav) + page thumbnails sidebar + main
 * content + metadata sidebar.
 *
 * Phase C: useDetailData 가 testId 의 pages / problems / reviews / variantHistory
 * 를 Supabase 에서 4-병렬 fetch + Storage signed URL 발급. SUPABASE_ENABLED=false
 * 면 모든 list 빈 배열 → placeholder.
 */
export const DetailScreen = () => {
  const selectedTestId = useAppStore((s) => s.selectedTestId);
  const backToLibrary = useAppStore((s) => s.backToLibrary);
  const startWizard = useAppStore((s) => s.startWizard);
  const getTest = useLibraryStore((s) => s.getTest);

  const test = selectedTestId ? getTest(selectedTestId) : undefined;
  const detail = useDetailData(selectedTestId);

  const [activeTab, setActiveTab] = useState<DetailTab>("problems");
  const [activePage, setActivePage] = useState(1);
  const [resuming, setResuming] = useState(false);

  /**
   * 위자드 진입 — 저장된 시험지를 hydrate 후 step 결정:
   *   - `forceStep` 명시: 해당 step 으로 강제 (변형 만들기 = Step 3 옵션)
   *   - 미명시: `decideResumeStep` 자동 (이어서 작업 = 미완료 step)
   *
   * `suspendWizardSync` 로 감싸 hydrate 의 set() 이 variant_history 를 오염시키지
   * 않게 하고, `justHydrated` 플래그(hydrateFromTest 가 set)로 위자드의 resume
   * 다이얼로그를 skip 한다.
   */
  const handleResume = async (forceStep?: WizardStepIndex) => {
    if (!selectedTestId || resuming) return;
    setResuming(true);
    try {
      const snapshot = await hydrateWizardFromTest(selectedTestId);
      if (!snapshot) {
        window.alert("이어서 작업할 데이터가 없습니다.");
        return;
      }
      // 로딩 중 사용자가 보관함으로 돌아갔으면 화면 전환 취소.
      if (useAppStore.getState().screen !== "detail") return;
      // forceStep 명시 — snapshot.step override. *변형 만들기* 가 Step 3 으로
      // 강제 진입할 때 사용. 단순 *이어서 작업* 은 undefined → snapshot 의
      // decideResumeStep 결과 그대로.
      const finalSnapshot =
        forceStep !== undefined ? { ...snapshot, step: forceStep } : snapshot;
      suspendWizardSync(() =>
        useWizardStore.getState().hydrateFromTest(finalSnapshot),
      );
      startWizard(finalSnapshot.testId);
    } catch (err) {
      console.warn("[DetailScreen] 이어서 작업 실패:", err);
      window.alert("이어서 작업 진입에 실패했습니다.");
    } finally {
      setResuming(false);
    }
  };

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

  const pageCount = detail.pages.length || 1;
  const thumbs = detail.pages.map((p) => ({ pageNum: p.page_num, url: p.thumbUrl }));
  const activePageObj: PageWithUrls | undefined = detail.pages.find(
    (p) => p.page_num === activePage,
  );
  const activeProblems: OCRProblem[] = activePageObj
    ? detail.problemsByPage.get(activePageObj.id) ?? []
    : [];
  const solutionCount = detail.problems.filter((p) => p.solution).length;
  const historyCount = detail.history.length;

  // Phase D — 활성 페이지의 hi-res URL → base64 dataURL (OCRItem 의 도형 crop 용)
  const activePageDataUrl = useImageAsDataUrl(activePageObj?.imageUrl);

  // Phase D — variants 를 detail.history 로 enrich. HeroCard / DetailMetaSidebar 가
  // 그대로 받아 표시.
  const enrichedTest =
    detail.history.length > 0
      ? { ...test, variants: detail.history.map(historyRowToVariant) }
      : test;

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
          /* 액션은 우측 sidebar 의 *액션* 섹션으로 통합 — 사용자 보고 (2026-05-26):
             TopBar 의 공유/PDF/이어서작업 + 하단 CtaBanner 가 *제각각 위치* 라 불편.
             좌우측 공간 활용 위해 모두 sidebar 최상단으로 모음. */
          undefined
        }
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <PageThumbnails
          pageCount={pageCount}
          activePage={activePage}
          onSelect={setActivePage}
          thumbs={thumbs}
        />

        <main className="flex-1 overflow-auto">
          <div className="max-w-[2400px] mx-auto px-8 py-6">
            <HeroCard test={enrichedTest} problems={detail.problems} />

            <div className="mt-[22px] mb-5">
              <ProblemTabs
                active={activeTab}
                onChange={setActiveTab}
                counts={{
                  problems: detail.problems.length || test.problemCount,
                  solutions: solutionCount,
                  history: historyCount || test.variants.length,
                }}
              />
            </div>

            {detail.loading ? (
              <TabPlaceholder icon="circle-notch" message="데이터 로드 중…" />
            ) : detail.error ? (
              <TabPlaceholder icon="warning" message={`오류: ${detail.error}`} />
            ) : (
              <>
                {activeTab === "problems" && (
                  <ProblemsTab
                    activePageObj={activePageObj}
                    activePage={activePage}
                    problems={activeProblems}
                    pageImageDataUrl={activePageDataUrl}
                  />
                )}
                {activeTab === "solutions" && (
                  <SolutionsTab
                    activePageObj={activePageObj}
                    activePage={activePage}
                    problems={activeProblems}
                  />
                )}
                {activeTab === "history" && (
                  <HistoryTab history={detail.history} reviews={detail.reviews} />
                )}
                {activeTab === "stats" && selectedTestId && (
                  <StatsTabContent
                    testId={selectedTestId}
                    grade={test?.grade ?? ""}
                    pages={detail.pages}
                    problems={detail.problems}
                  />
                )}
              </>
            )}

            {/* CtaBanner 는 DetailMetaSidebar 의 *액션* 섹션으로 이동 — 사용자 보고. */}
          </div>
        </main>

        <DetailMetaSidebar
          test={enrichedTest}
          onMakeVariant={() => handleResume(4)}
          onResume={() => handleResume()}
          resuming={resuming}
          loading={detail.loading}
        />
      </div>
    </div>
  );
};

// ============================================================================
// Tabs (Phase C — Detail 전용)
// ============================================================================

const ProblemsTab = ({
  activePageObj,
  activePage,
  problems,
  pageImageDataUrl,
}: {
  activePageObj: PageWithUrls | undefined;
  activePage: number;
  problems: OCRProblem[];
  /** Phase D: 활성 페이지의 hi-res base64 dataURL — OCRItem 이 도형 crop 에 사용. */
  pageImageDataUrl: string | null;
}) => {
  if (!activePageObj) {
    return (
      <TabPlaceholder icon="list-numbers" message={`${activePage}페이지를 찾을 수 없습니다.`} />
    );
  }
  if (problems.length === 0) {
    return (
      <TabPlaceholder
        icon="list-numbers"
        message={`${activePage}페이지에 추출된 문항이 없습니다.`}
      />
    );
  }
  return (
    <div className="space-y-3">
      {problems.map((item) => (
        <OCRItem
          key={item.id}
          pageId={activePageObj.id}
          item={item}
          readonly
          pageImageDataUrl={pageImageDataUrl}
        />
      ))}
    </div>
  );
};

const SolutionsTab = ({
  activePageObj,
  activePage,
  problems,
}: {
  activePageObj: PageWithUrls | undefined;
  activePage: number;
  problems: OCRProblem[];
}) => {
  if (!activePageObj) {
    return (
      <TabPlaceholder icon="book-open" message={`${activePage}페이지를 찾을 수 없습니다.`} />
    );
  }
  const withSolution = problems.filter((p) => p.solution || p.answer);
  if (withSolution.length === 0) {
    return (
      <TabPlaceholder
        icon="book-open"
        message={`${activePage}페이지에 해설이 아직 없습니다.`}
      />
    );
  }
  return (
    <div className="space-y-3">
      {withSolution.map((item) => (
        <SolutionItem
          key={item.id}
          pageId={activePageObj.id}
          item={item}
          readonly
          onRegenerate={() => {
            /* readonly — noop */
          }}
        />
      ))}
    </div>
  );
};

const INTENSITY_LABEL: Record<number, string> = {
  0: "디지털화",
  1: "유사 변형",
  2: "변형 (다른 유형)",
};

/** Phase E: GeneratedProblem.diagramParams → MarkdownRenderer 의 diagramSvgs. */
const toDiagramSvgs = (
  params: DiagramParams[] | null | undefined,
): DiagramSvgItem[] | undefined => {
  if (!params?.length) return undefined;
  const items: DiagramSvgItem[] = [];
  for (let i = 0; i < params.length; i++) {
    try {
      items.push({ svg: renderDiagram(params[i]), label: `도형${i + 1}` });
    } catch (err) {
      console.warn(`[DetailScreen] renderDiagram ${i}:`, (err as Error).message);
    }
  }
  return items.length > 0 ? items : undefined;
};

const HistoryTab = ({
  history,
  reviews,
}: {
  history: Array<{ id: string; intensity: number; count: number; label: string | null; created_at: string }>;
  reviews: ProblemReview[];
}) => {
  if (history.length === 0 && reviews.length === 0) {
    return (
      <TabPlaceholder icon="git-branch" message="아직 생성된 변형이 없습니다." />
    );
  }
  return (
    <div className="space-y-4">
      {history.map((h) => (
        <Card key={h.id} pad={14}>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Chip size="sm" tone="accent" dot>
              {INTENSITY_LABEL[h.intensity] ?? `intensity=${h.intensity}`}
            </Chip>
            <span className="text-small text-muted">
              {h.count}문항 · {formatRelativeKo(h.created_at)}
            </span>
            {h.label && <span className="text-caption text-muted">· {h.label}</span>}
          </div>
        </Card>
      ))}
      {reviews.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-h3 text-text">변형 결과 ({reviews.length})</h3>
          {/* 사용자 보고 2026-06-02: 변형 결과 카드가 모두 펼쳐져 스크롤 낭비.
              각 카드를 <details> 로 접기/펼치기 (기본 접힘). summary 에 상태·모델
              요약, 펼치면 원본/변형 비교. */}
          {reviews.map((r, ri) => (
            <Card key={r.id} pad={14}>
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
                  <Icon
                    name="caret-right"
                    size={12}
                    className="text-muted transition-transform group-open:rotate-90"
                  />
                  <span className="text-small font-semibold text-text">변형 {ri + 1}</span>
                  <Chip size="sm" tone={r.status === "confirmed" ? "ok" : "neutral"} dot>
                    {r.status === "confirmed" ? "확정" : r.status === "review" ? "검토" : "대기"}
                  </Chip>
                  {r.genModel && (
                    <span className="text-caption text-muted font-mono">{r.genModel}</span>
                  )}
                  <span className="text-caption text-muted ml-auto">원본 ↔ 변형</span>
                </summary>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                  <div className="border border-line rounded-r2 p-3 bg-surface2">
                    <div className="text-caption text-muted mb-1.5 font-semibold">원본</div>
                    <MarkdownRenderer
                      content={r.original.question}
                      diagramSvgs={toDiagramSvgs(r.original.diagramParams)}
                    />
                  </div>
                  <div className="border border-accent/30 rounded-r2 p-3 bg-accent-soft/30">
                    <div className="text-caption text-muted mb-1.5 font-semibold">변형</div>
                    <MarkdownRenderer
                      content={r.variant.question}
                      diagramSvgs={toDiagramSvgs(r.variant.diagramParams)}
                    />
                  </div>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default DetailScreen;
