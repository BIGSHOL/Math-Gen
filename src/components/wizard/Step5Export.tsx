import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Heading, Icon } from "@app/components/ui";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import { getPageImage } from "@app/lib/imageStore";
import { cropPageImageData } from "@app/lib/pdfProcessor";
import {
  paginateAnswerKey,
  paginateProblems,
  type PaginatedAnswerPage,
  type PaginatedPage,
} from "@app/lib/printLayout";
import { usePreviewScale, A4_HEIGHT_PX } from "@app/hooks/usePreviewScale";
import { A4Page } from "@app/components/print/A4Page";
import { PrintableHeader } from "@app/components/print/PrintableHeader";
import { PrintQuestionBlock } from "@app/components/print/PrintQuestionBlock";
import { PrintAnswerKeyPage } from "@app/components/print/PrintAnswerKeyPage";
import { PrintOptionsPanel } from "@app/components/print/PrintOptionsPanel";
import { PrintActionPanel } from "@app/components/print/PrintActionPanel";
import { ZoomToolbar } from "@app/components/print/ZoomToolbar";
import { GRADE_LABELS } from "@app/services/ai/mathDefense";

/**
 * Step 5 — PDF 내보내기 + 인쇄.
 *
 * 3-pane orchestrator:
 *   [좌: PrintOptionsPanel] [중앙: ZoomToolbar + 미리보기 갤러리] [우: PrintActionPanel]
 *
 * **printable-root** (`<div className="hidden print:block printable-root" data-print-root>`):
 *   - screen 미디어에선 숨겨져 있고, `@media print` 에서만 노출
 *   - PDF 캡처도 같은 hidden DOM 을 사용 — `pdfExporter` 의 onclone 이 display
 *     강제로 paint 가능하게 함
 *
 * **두 effect**:
 *   1. bundle.answers seed (mount 1회) — Step3 의 answers 옵션이 켜져 있으면
 *      Step5 진입 시 자동으로 printOptions.showAnswers = true
 *   2. originalDiagramMap — exportSource 가 "original" 또는 "both" 일 때만
 *      문항별 원본 도형 (OCRImage bbox) crop 일괄 실행
 */
export const Step5Export = () => {
  const problems = useWizardStore((s) => s.problems);
  const pages = useWizardStore((s) => s.pages);
  const printOptions = useWizardStore((s) => s.printOptions);
  const exportSource = useWizardStore((s) => s.exportSource);
  const bundle = useWizardStore((s) => s.bundle);
  const filename = useWizardStore((s) => s.filename);
  const testId = useWizardStore((s) => s.testId);
  const selectedGrade = useWizardStore((s) => s.selectedGrade);
  const setExport = useWizardStore((s) => s.setExport);
  const goBackToStep4 = useWizardStore((s) => s.prev);

  const sourceTest = useLibraryStore((s) => (testId ? s.getTest(testId) : undefined));
  const backToLibrary = useAppStore((s) => s.backToLibrary);

  // ── effect 1: bundle.answers seed (mount-only) ───────────────────────
  const seedRef = useRef(false);
  useEffect(() => {
    if (seedRef.current) return;
    seedRef.current = true;
    if (bundle.answers && !printOptions.showAnswers) {
      setExport({ printOptions: { ...printOptions, showAnswers: true } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── effect 2: originalDiagramMap (exportSource 변경 시 재계산) ─────────
  const [originalDiagramMap, setOriginalDiagramMap] = useState<
    Map<string, Array<{ dataUrl: string; label: string }>>
  >(new Map());

  useEffect(() => {
    if (exportSource === "variant") {
      // 변형만 보여줄 때는 원본 도형 crop 불필요.
      setOriginalDiagramMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const next = new Map<string, Array<{ dataUrl: string; label: string }>>();
      // 페이지 이미지 dataUrl 캐시 (한 페이지 안에 여러 item 이 같은 이미지 사용).
      const pageImageCache = new Map<string, string | null>();

      for (const page of pages) {
        for (const item of page.ocrResult) {
          if (!item.images || item.images.length === 0) continue;
          // problems 에 매칭되는 ProblemReview 가 있는지 확인.
          const matched = problems.find((p) => p.id === item.id);
          if (!matched) continue;

          let pageDataUrl = pageImageCache.get(page.id);
          if (pageDataUrl === undefined) {
            const img = await getPageImage(page.imageRef);
            pageDataUrl = img?.dataUrl ?? null;
            pageImageCache.set(page.id, pageDataUrl);
          }
          if (!pageDataUrl) continue;

          const crops: Array<{ dataUrl: string; label: string }> = [];
          for (const ocrImg of item.images) {
            try {
              const cropped = await cropPageImageData(pageDataUrl, ocrImg.box, {
                margin: 0.04,
              });
              crops.push({ dataUrl: cropped, label: ocrImg.label });
            } catch (err) {
              // best-effort — 한 도형 실패는 다른 도형에 영향 X
              // eslint-disable-next-line no-console
              console.warn("[Step5Export] crop 실패:", item.id, err);
            }
          }
          if (crops.length > 0) {
            next.set(item.id, crops);
          }
        }
      }
      if (!cancelled) setOriginalDiagramMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [exportSource, problems, pages]);

  // 페이지 분할 — printOptions / problems / diagramMap 의존.
  const diagramFlagMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const [id, crops] of originalDiagramMap) {
      m.set(id, crops.length > 0);
    }
    return m;
  }, [originalDiagramMap]);

  const layoutPages: PaginatedPage[] = useMemo(
    () =>
      paginateProblems({
        problems,
        exportSource,
        template: printOptions.template,
        columns: printOptions.columns,
        spacing: printOptions.spacing,
        diagramMap: diagramFlagMap,
      }),
    [problems, exportSource, printOptions.template, printOptions.columns, printOptions.spacing, diagramFlagMap],
  );

  const answerLayoutPages: PaginatedAnswerPage[] = useMemo(() => {
    if (!printOptions.showAnswers || problems.length === 0) return [];
    return paginateAnswerKey({
      problems,
      exportSource,
      quickAnswerOnly: printOptions.quickAnswerOnly,
      spacing: printOptions.spacing,
    });
  }, [printOptions.showAnswers, printOptions.quickAnswerOnly, printOptions.spacing, problems, exportSource]);

  const totalPages = layoutPages.length + answerLayoutPages.length;
  const gradeBadge = selectedGrade ? GRADE_LABELS[selectedGrade] : undefined;
  const testTitle = sourceTest?.title ?? filename ?? "변형 시험지";

  const { scale, scalePercent, galleryRef, fitToContainer, setScale, setScaleFromSlider } =
    usePreviewScale();

  const printableRootRef = useRef<HTMLDivElement>(null);

  // ── 빈 상태 가드 ────────────────────────────────────────────────────
  if (problems.length === 0) {
    return (
      <div className="max-w-[520px] mx-auto px-6 py-16 text-center">
        <Icon name="warning" size={36} weight="duotone" color="#F59E0B" />
        <Heading level="h2" className="mt-4 justify-center">
          <span>내보낼 문항이 없습니다</span>
        </Heading>
        <p className="mt-3 text-body text-muted">
          Step 4 (검토) 에서 변형 문제를 먼저 생성해 주세요. 또는 시험지를 새로
          업로드해 처음부터 시작할 수 있습니다.
        </p>
        <div className="mt-5 flex gap-2 justify-center">
          <Btn kind="accent" icon="arrow-left" onClick={goBackToStep4}>
            Step 4 로 돌아가기
          </Btn>
          <Btn kind="ghost" icon="house" onClick={backToLibrary}>
            라이브러리
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-bg">
      {/* 좌측: 옵션 사이드바 */}
      <PrintOptionsPanel
        className="wizard-chrome"
        printOptions={printOptions}
        exportSource={exportSource}
        onChangePrintOptions={(patch) =>
          setExport({ printOptions: { ...printOptions, ...patch } })
        }
        onChangeExportSource={(next) => setExport({ exportSource: next })}
      />

      {/* 중앙: 미리보기 */}
      <main className="flex-1 flex flex-col min-w-0 bg-surface2">
        <ZoomToolbar
          scale={scale}
          scalePercent={scalePercent}
          onScaleFromSlider={setScaleFromSlider}
          onSetScale={setScale}
          onFitToContainer={fitToContainer}
          className="wizard-chrome"
          leftContent={
            <span className="font-semibold text-text">
              {totalPages} 페이지 · {printOptions.columns}단
            </span>
          }
        />
        <div
          ref={galleryRef}
          className="flex-1 overflow-auto p-6"
          style={{ minHeight: A4_HEIGHT_PX * 0.5 }}
        >
          <div className="flex flex-col items-center gap-8">
            {/* 문제 페이지 */}
            {layoutPages.map((page, pageIdx) => (
              <A4Page
                key={`q-${pageIdx}`}
                scale={scale}
                paddingClass="px-14 py-10"
              >
                <PageBody
                  page={page}
                  pageIdx={pageIdx}
                  totalPages={totalPages}
                  testTitle={testTitle}
                  gradeBadge={gradeBadge}
                  options={printOptions}
                  exportSource={exportSource}
                  originalDiagramMap={originalDiagramMap}
                />
              </A4Page>
            ))}

            {/* 정답 + 해설 페이지 */}
            {answerLayoutPages.map((ap, apIdx) => (
              <A4Page
                key={`a-${apIdx}`}
                scale={scale}
                paddingClass="px-14 py-10"
              >
                <PrintAnswerKeyPage
                  questionNumbers={ap.questionNumbers}
                  allProblems={problems}
                  options={printOptions}
                  exportSource={exportSource}
                  testTitle={testTitle}
                  gradeBadge={gradeBadge}
                  pageInfo={`${layoutPages.length + apIdx + 1} / ${totalPages}`}
                  isFirstAnswerPage={apIdx === 0}
                />
              </A4Page>
            ))}
          </div>
        </div>
      </main>

      {/* 우측: 액션 패널 */}
      <PrintActionPanel
        className="wizard-chrome"
        printableRootRef={printableRootRef}
        totalPages={totalPages}
        problemPages={layoutPages.length}
        answerPages={answerLayoutPages.length}
        problemCount={problems.length}
      />

      {/* 인쇄/PDF 캡처 전용 hidden DOM — 미리보기와 동일 컨텐츠, scale=1 */}
      <div
        ref={printableRootRef}
        className="hidden print:block printable-root"
        data-print-root
      >
        {layoutPages.map((page, pageIdx) => (
          <div
            key={`p-q-${pageIdx}`}
            data-print-page="true"
            className="w-[210mm] h-[297mm] px-14 py-10 bg-white"
            style={{ pageBreakAfter: "always" }}
          >
            <PageBody
              page={page}
              pageIdx={pageIdx}
              totalPages={totalPages}
              testTitle={testTitle}
              gradeBadge={gradeBadge}
              options={printOptions}
              exportSource={exportSource}
              originalDiagramMap={originalDiagramMap}
            />
          </div>
        ))}
        {answerLayoutPages.map((ap, apIdx) => (
          <div
            key={`p-a-${apIdx}`}
            data-print-page="true"
            className="w-[210mm] h-[297mm] px-14 py-10 bg-white"
            style={{
              pageBreakAfter:
                apIdx === answerLayoutPages.length - 1 ? "auto" : "always",
            }}
          >
            <PrintAnswerKeyPage
              questionNumbers={ap.questionNumbers}
              allProblems={problems}
              options={printOptions}
              exportSource={exportSource}
              testTitle={testTitle}
              gradeBadge={gradeBadge}
              pageInfo={`${layoutPages.length + apIdx + 1} / ${totalPages}`}
              isFirstAnswerPage={apIdx === 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── PageBody — 한 페이지의 헤더 + 문항 grid 렌더 ─────────────────────
interface PageBodyProps {
  page: PaginatedPage;
  pageIdx: number;
  totalPages: number;
  testTitle: string;
  gradeBadge?: string;
  options: ReturnType<typeof useWizardStore.getState>["printOptions"];
  exportSource: ReturnType<typeof useWizardStore.getState>["exportSource"];
  originalDiagramMap: Map<string, Array<{ dataUrl: string; label: string }>>;
}

const PageBody = ({
  page,
  pageIdx,
  totalPages,
  testTitle,
  gradeBadge,
  options,
  exportSource,
  originalDiagramMap,
}: PageBodyProps) => {
  // 컬럼별로 전역 번호 계산 — page.startingNumber 부터 시작해 col0 채우고 col1.
  let runningNumber = page.startingNumber;
  const numberedColumns = page.columns.map((col) => {
    const numbered = col.map((p) => ({ problem: p, num: runningNumber++ }));
    return numbered;
  });

  return (
    <div className="flex flex-col h-full">
      <PrintableHeader
        title={testTitle}
        gradeBadge={gradeBadge}
        isFirstPage={pageIdx === 0}
        variant={options.template}
        accentColor={options.color}
        pageInfo={`${pageIdx + 1} / ${totalPages}`}
        showDate={options.showDate}
      />

      <div className="flex-1 min-h-0 flex w-full gap-8 mt-2 relative overflow-hidden">
        {numberedColumns.map((col, colIdx) => (
          <div
            key={colIdx}
            className={
              options.columns === 2
                ? `flex-1 pl-8 first:pl-0 ${
                    options.columnDivider ? "border-l border-slate-300 first:border-l-0" : ""
                  }`
                : "w-full"
            }
            style={
              options.columns === 2 && options.columnDivider
                ? { WebkitPrintColorAdjust: "exact" }
                : undefined
            }
          >
            <div className="pb-4">
              {col.map(({ problem, num }) => (
                <PrintQuestionBlock
                  key={problem.id}
                  problem={problem}
                  questionNumber={num}
                  options={options}
                  exportSource={exportSource}
                  originalDiagrams={originalDiagramMap.get(problem.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Step5Export;
