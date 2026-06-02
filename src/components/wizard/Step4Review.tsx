import { useMemo } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import { usePageImageDataUrl } from "@app/hooks/usePageImageDataUrl";
import { useVariantGen } from "@app/hooks/useVariantGen";
import { useWizardStore } from "@app/stores/wizardStore";
import OCRItem from "./OCRItem";
import PageThumbColumn from "./PageThumbColumn";
import VariantItem from "./VariantItem";

/**
 * Step 4 — variant problem review screen.
 *
 * 3-pane layout (`Step3SolutionReview` 패턴 차용):
 *   [ thumb column ] [ 중앙: 원본 OCR read-only ] [ 우측: 변형 카드 ]
 *
 * `useVariantGen` hook 마운트 — seed (pages → ProblemReview[]) + per-item
 * dispatch. 우측 패널은 현재 활성 페이지의 문항에 대응하는 ProblemReview 만
 * 표시.
 *
 * **헤더**:
 *   - `filterChip` (전체 / 검토 필요 / 미확정) — store 의 `reviewFilter` 활용
 *   - 전체 진행률 (완료 N / 총 M)
 *   - "옵션 적용해 재생성" 버튼 (Step 3 옵션 변경 후 reseed)
 */

export const Step4Review = () => {
  const pages = useWizardStore((s) => s.pages);
  const problems = useWizardStore((s) => s.problems);
  const activeIdx = useWizardStore((s) => s.activePageIndex);
  const reviewFilter = useWizardStore((s) => s.reviewFilter);
  const goal = useWizardStore((s) => s.goal);
  const difficulty = useWizardStore((s) => s.difficulty);
  const updateProblem = useWizardStore((s) => s.updateProblem);

  const { resetDispatch, reseedAll } = useVariantGen();

  const activePage = pages[activeIdx];
  // 공용 hook (IndexedDB → Storage fallback → rotation) — Step3 와 동일 수정.
  // 로컬 hook 은 IndexedDB 만 읽어 hydrate 세션에서 변형 카드의 원본 이미지/
  // 도형이 안 보이는 버그가 있었음 (사용자 보고 2026-06-02).
  const pageImage = usePageImageDataUrl(activePage);
  const setActiveIdx = (i: number) =>
    useWizardStore.setState({ activePageIndex: i });
  const setReviewFilter = (f: "all" | "review" | "pending") =>
    useWizardStore.setState({ reviewFilter: f });

  // 활성 페이지의 item id 집합 — 우측 panel 의 variant 카드 매칭.
  const activeItemIds = useMemo(() => {
    if (!activePage) return new Set<string>();
    return new Set(activePage.ocrResult.map((it) => it.id));
  }, [activePage]);

  // 도형 여부 lookup — VariantItem 의 `hasDiagram` chip 용.
  const hasDiagramMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of pages) {
      for (const it of p.ocrResult) {
        m.set(it.id, (it.images?.length ?? 0) > 0);
      }
    }
    return m;
  }, [pages]);

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

  // 전체 진행률.
  const totalCount = problems.length;
  const confirmedCount = problems.filter((p) => p.status === "confirmed").length;
  const reviewCount = problems.filter((p) => p.status === "review").length;
  const pendingCount = problems.filter((p) => p.status === "pending").length;
  const errorCount = problems.filter((p) => !!p.genError).length;
  const generatingCount = problems.filter((p) => p.generating).length;

  // 필터 적용. **전체** 는 활성 페이지 문항만 (페이지별 검토 흐름), **검토/미확정**
  // 은 *모든 페이지* 를 대상으로 한다 — 헤더 카운트(검토/대기/실패)는 전역인데
  // 필터를 활성 페이지로 한정하면 "검토 2" 인데 필터 결과 0 인 불일치 발생
  // (사용자 보고 2026-06-02: 다른 페이지의 검토 항목이 안 보임).
  const activeProblems = problems.filter((p) => activeItemIds.has(p.id));
  const filteredProblems = (reviewFilter === "all" ? activeProblems : problems).filter(
    (p) => {
      if (reviewFilter === "all") return true;
      if (reviewFilter === "review") return p.status === "review";
      if (reviewFilter === "pending")
        return p.status === "pending" || !!p.genError;
      return true;
    },
  );

  return (
    <div className="flex gap-4 h-full px-6 py-5 min-h-[580px]">
      <PageThumbColumn
        pages={pages}
        activeIndex={activeIdx}
        onSelect={setActiveIdx}
      />

      {/* 중앙: 원본 문제 (read-only) */}
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
          {activePage.ocrResult.length === 0 ? (
            <Card pad={16} className="bg-surface2">
              <p className="text-small text-muted">
                이 페이지에 OCR 결과가 없습니다. (스킵된 페이지 또는 OCR 미완료)
              </p>
            </Card>
          ) : (
            activePage.ocrResult.map((item) => (
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

      {/* 우측: 변형 문제 */}
      <section className="flex-[1.2] min-w-0 flex flex-col">
        {/* 옵션 mismatch 안내 — Step 3 에서 옵션 바꿨는데 기존 problems 가 옛 옵션 결과 그대로 남은 경우.
            digitize 면 변형 호출 0건이어야 하는데 genError 있으면 옛 옵션의 잔재. */}
        {goal === "digitize" && errorCount > 0 && (
          <Card pad={12} className="mb-3 bg-warn-soft border-warn/30 border-l-4">
            <div className="flex items-start gap-2">
              <Icon name="info" size={16} color="#F59E0B" weight="duotone" className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-small">
                <div className="font-semibold text-warn-ink mb-1">
                  옵션이 변경되었습니다 — *디지털화* 선택
                </div>
                <p className="text-warn-ink/80 text-caption leading-relaxed">
                  현재 옵션은 "디지털화만" 인데 화면에 표시된 결과는 *이전 변형 옵션*
                  의 잔재 ({errorCount} 건 실패). 우측 *옵션 재생성* 버튼을 누르면
                  새 옵션에 맞게 모든 문항이 *변환 X 원본 그대로* 확정됩니다.
                </p>
              </div>
              <Btn
                kind="accent"
                size="sm"
                icon="arrow-clockwise"
                onClick={() => {
                  if (
                    // eslint-disable-next-line no-alert
                    window.confirm(
                      "디지털화 옵션으로 모든 문항을 원본 그대로 확정합니다. 기존 변형 결과/에러는 사라집니다. 계속?",
                    )
                  ) {
                    reseedAll();
                  }
                }}
              >
                지금 재생성
              </Btn>
            </div>
          </Card>
        )}

        <header className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Chip tone="accent" size="sm" icon="sparkle">
              변형 문제
            </Chip>
            <span className="text-small text-muted">
              확정 {confirmedCount} / {totalCount}
              {reviewCount > 0 && (
                <span className="ml-2 text-accent-ink">· 검토 {reviewCount}</span>
              )}
              {pendingCount > 0 && (
                <span className="ml-2 text-muted">· 대기 {pendingCount}</span>
              )}
              {generatingCount > 0 && (
                <span className="ml-2 text-accent">
                  · 생성 중 {generatingCount}
                </span>
              )}
              {errorCount > 0 && (
                <span className="ml-2 text-danger">· 실패 {errorCount}</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <FilterChip
              label="전체"
              active={reviewFilter === "all"}
              onClick={() => setReviewFilter("all")}
            />
            <FilterChip
              label="검토"
              active={reviewFilter === "review"}
              onClick={() => setReviewFilter("review")}
            />
            <FilterChip
              label="미확정"
              active={reviewFilter === "pending"}
              onClick={() => setReviewFilter("pending")}
            />
            <Btn
              kind="ghost"
              size="sm"
              icon="arrow-clockwise"
              onClick={() => {
                if (
                  // eslint-disable-next-line no-alert
                  window.confirm(
                    `현재 옵션 (${goal} / ${difficulty}) 으로 모든 문항의 변형을 다시 생성합니다. 기존 변형 결과는 사라집니다. 계속하시겠습니까?`,
                  )
                ) {
                  reseedAll();
                }
              }}
              title="옵션 적용해 전체 재생성"
            >
              옵션 재생성
            </Btn>
          </div>
        </header>

        <div className="flex-1 overflow-auto flex flex-col gap-2.5 pr-1">
          {filteredProblems.length === 0 ? (
            <Card pad={16} className="bg-surface2">
              <p className="text-small text-muted">
                {reviewFilter === "all"
                  ? "이 페이지에는 변형할 문항이 없습니다. 다른 페이지를 선택하거나 Step 2 에서 OCR 을 완료해 주세요."
                  : "필터 조건에 맞는 문항이 없습니다. 필터를 바꿔 보세요."}
              </p>
            </Card>
          ) : (
            filteredProblems.map((p, idx) => (
              <VariantItem
                key={p.id}
                problem={p}
                index={idx + 1}
                hasDiagram={hasDiagramMap.get(p.id)}
                onRegenerate={() => {
                  resetDispatch(p.id);
                  updateProblem(p.id, {
                    variant: p.original,
                    status: "pending",
                    genError: undefined,
                    generating: false,
                  });
                }}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
};

const FilterChip = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2 py-1 rounded-r1 text-[11.5px] font-medium border transition-colors ${
      active
        ? "bg-accent text-white border-accent"
        : "bg-surface text-text2 border-line hover:border-accent"
    }`}
  >
    {label}
  </button>
);

export default Step4Review;
