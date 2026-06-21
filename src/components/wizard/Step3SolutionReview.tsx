import { Btn, Card, Chip, Heading, Icon } from "@app/components/ui";
import { usePageImageDataUrl } from "@app/hooks/usePageImageDataUrl";
import { useSolutionGen } from "@app/hooks/useSolutionGen";
import { useWizardStore } from "@app/stores/wizardStore";
import OCRItem from "./OCRItem";
import PageThumbColumn from "./PageThumbColumn";
import SolutionItem from "./SolutionItem";

/**
 * Step 3 — solution + answer review screen.
 *
 * 3-pane layout mirroring `Step2OCRReview`:
 *   [ thumb column ] [ flex-1 OCR cards (read-only) ] [ flex-1.2 solution cards ]
 *
 * The `useSolutionGen` hook is mounted here. On entry it walks every page's
 * `ocrResult[]` and dispatches a Sonnet-4.6 call per problem (with
 * `pLimit(3)` concurrency). Results stream into the store via `updateOCRItem`,
 * which propagates to the right-pane `<SolutionItem>` cards.
 *
 * Per-card "재생성" buttons clear the dispatched marker via the hook's
 * `resetDispatch` callback, then null out the solution/error fields — the
 * next effect tick picks the item back up automatically.
 */
export const Step3SolutionReview = () => {
  const pages = useWizardStore((s) => s.pages);
  const activeIdx = useWizardStore((s) => s.activePageIndex);
  const skipSolutions = useWizardStore((s) => s.skipSolutions);
  const setSkipSolutions = useWizardStore((s) => s.setSkipSolutions);
  const setStep = useWizardStore((s) => s.setStep);

  // skipSolutions 여도 hook 은 *항상* 호출 (rules-of-hooks) — 내부 effect 가
  // skipSolutions 를 보고 자동발사를 차단하므로 비용 0.
  const { resetDispatch } = useSolutionGen();

  const activePage = pages[activeIdx];
  // 공용 hook (IndexedDB → Storage fallback → rotation). 이전엔 로컬 hook 이
  // IndexedDB 만 읽어 "이어서 작업" hydrate 세션(이미지가 Storage 에만 존재)에서
  // pageImage 가 항상 null → OCRItem 의 ai-crop(작품/도형) 크롭 실패 → 이미지
  // 안 보임 (사용자 보고 2026-06-02). Storage fallback 있는 공용 hook 으로 교체.
  const { url: pageImage } = usePageImageDataUrl(activePage);
  const setActiveIdx = (i: number) => useWizardStore.setState({ activePageIndex: i });

  if (!activePage) {
    return (
      <div className="max-w-[640px] mx-auto px-6 py-10 text-center">
        <Icon name="warning" size={36} weight="duotone" color="#F59E0B" />
        <p className="mt-3 text-body text-muted">
          업로드된 페이지가 없습니다. 1단계로 돌아가 PDF를 업로드해 주세요.
        </p>
      </div>
    );
  }

  // 해설 건너뛰기 상태 — 자동 생성 차단됨. opt-in("해설 생성하기")으로 해제 가능.
  if (skipSolutions) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-16 text-center">
        <Icon name="fast-forward" size={36} weight="duotone" color="#0EA5E9" />
        <Heading level="h2" className="mt-3">
          해설 생성을 건너뛰는 중
        </Heading>
        <p className="mt-2 text-body text-muted">
          이 시험지는 해설·정답 없이 진행합니다. 문제지(HWP·인쇄)는 해설 없이도
          내보낼 수 있어요. 필요하면 지금 해설을 생성할 수 있습니다.
        </p>
        <div className="mt-6 flex gap-2 justify-center">
          <Btn kind="accent" icon="sparkle" onClick={() => setSkipSolutions(false)}>
            해설 생성하기
          </Btn>
          <Btn kind="ghost" iconRight="arrow-right" onClick={() => setStep(4)}>
            옵션으로
          </Btn>
        </div>
      </div>
    );
  }

  // Aggregate stats across all problem pages — drives the header progress.
  const allItems = pages.flatMap((p) => p.ocrResult);
  const totalEligible = allItems.filter(
    (it) => it.text && !it.bodyMissing,
  ).length;
  const completedCount = allItems.filter((it) => !!it.solution).length;
  const failedCount = allItems.filter((it) => !!it.solutionError).length;

  const activeItems = activePage.ocrResult;
  const eligibleOnActive = activeItems.filter(
    (it) => it.text && !it.bodyMissing,
  );

  return (
    <div className="flex gap-4 h-full px-6 py-5 min-h-[580px]">
      <PageThumbColumn pages={pages} activeIndex={activeIdx} onSelect={setActiveIdx} />

      {/* 중앙: 원본 문제 (OCR 결과 read-only) */}
      <section className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Chip size="sm" icon="scan">
              원본 문제
            </Chip>
            <span className="text-small text-muted font-mono">
              p.{activeIdx + 1} / {pages.length}
            </span>
          </div>
        </header>
        <div className="flex-1 overflow-auto flex flex-col gap-2.5 pr-1">
          {activeItems.length === 0 ? (
            <Card pad={16} className="bg-surface2">
              <p className="text-small text-muted">
                이 페이지에 OCR 결과가 없습니다. (스킵된 페이지 또는 OCR 미완료)
              </p>
            </Card>
          ) : (
            activeItems.map((item) => (
              <OCRItem
                key={item.id}
                pageId={activePage.id}
                item={item}
                pageImageDataUrl={pageImage}
                readonly
              />
            ))
          )}
        </div>
      </section>

      {/* 우측: 해설·정답 */}
      <section className="flex-[1.2] min-w-0 flex flex-col">
        <header className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Chip tone="accent" size="sm" icon="sparkle">
              해설·정답
            </Chip>
            <span className="text-small text-muted">
              {completedCount} / {totalEligible} 문항 완료
              {failedCount > 0 && (
                <span className="ml-2 text-warnInk">· 실패 {failedCount}</span>
              )}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto flex flex-col gap-2.5 pr-1">
          {eligibleOnActive.length === 0 ? (
            <Card pad={16} className="bg-surface2">
              <p className="text-small text-muted">
                이 페이지에는 해설을 생성할 문항이 없습니다. 다른 페이지를 선택해 주세요.
              </p>
            </Card>
          ) : (
            eligibleOnActive.map((item) => (
              <SolutionItem
                key={item.id}
                pageId={activePage.id}
                item={item}
                onRegenerate={() => resetDispatch(activePage.id, item.id)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Step3SolutionReview;
