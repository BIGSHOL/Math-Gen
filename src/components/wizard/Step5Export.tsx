import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { PrintAnswerKeyPage } from "@app/components/print/PrintAnswerKeyPage";
import { PrintOptionsPanel } from "@app/components/print/PrintOptionsPanel";
import { PrintActionPanel } from "@app/components/print/PrintActionPanel";
import { ZoomToolbar } from "@app/components/print/ZoomToolbar";
import {
  PyeonggaTemplate,
  JeongtongTemplate,
  ModernTemplate,
  WorkbookTemplate,
  JaseupTemplate,
  YuhyungTemplate,
} from "@app/components/print/templates";
import type { PrintMeta, PrintTemplateProps } from "@app/components/print/types";
import { getFontPack } from "@app/lib/printFontPacks";
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
            {/* 문제 페이지 — 6 신규 template 이 자체 padding 보유. bare. */}
            {layoutPages.map((page, pageIdx) => (
              <A4Page key={`q-${pageIdx}`} scale={scale} bare>
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

            {/* 정답 + 해설 페이지 — 기존 padding 유지 (template-agnostic). */}
            {answerLayoutPages.map((ap, apIdx) => (
              <A4Page
                key={`a-${apIdx}`}
                scale={scale}
                paddingClass="px-10 py-7"
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
            className="w-[210mm] h-[297mm] bg-white overflow-hidden"
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
            className="w-[210mm] h-[297mm] px-10 py-7 bg-white"
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

// ── PageBody — template dispatcher ──────────────────────────────────────
//
// 신규 6 template (design_handoff_print_templates) 의 standalone 컴포넌트가
// 각자 헤더 + 본문 + 푸터를 자체 통합. PageBody 는 *template switch* + props
// 합성 + 컴포넌트 호출 만 담당.
//
// `page.columns.flat()` 으로 평탄 배열 전달 — BodyContainer 안의
// `React.Children.toArray + half split` 가 2단을 자체 분할.
interface PageBodyProps {
  page: PaginatedPage;
  pageIdx: number;
  totalPages: number;
  testTitle: string;
  gradeBadge?: string;
  options: ReturnType<typeof useWizardStore.getState>["printOptions"];
  exportSource: ReturnType<typeof useWizardStore.getState>["exportSource"];
  // (deprecated, kept for prop drilling) 원본 도형 — 향후 ProblemBody 에
  // diagrams prop 으로 흘림. 현재는 6 신규 template 내부 호출이 diagrams
  // prop 안 받음 — Phase 2 후속에서 추가.
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  originalDiagramMap,
}: PageBodyProps) => {
  const meta: PrintMeta = {
    title: testTitle,
    schoolName: undefined,
    grade: gradeBadge,
    subject: "수학",
    semester: undefined,
    examDate: new Date().toISOString().slice(0, 10),
    examDuration: undefined,
    examiner: undefined,
    totalScore: 100,
    academyName: undefined,
    instructorName: undefined,
    conceptNote: undefined,
    todayGoal: undefined,
    patternName: undefined,
    patternStrategy: undefined,
  };

  const flatProblems = page.columns.flat();

  const props: PrintTemplateProps = {
    page: pageIdx + 1,
    totalPages,
    columns: options.columns,
    meta,
    problems: flatProblems,
    startingNumber: page.startingNumber,
    options,
  };

  // fontPack CSS variable 주입 — 6 template 의 inline `fontFamily: var(...)`
  // 가 이 wrapper 의 변수를 참조. 사용자가 PrintOptionsPanel 의 폰트 옵션
  // 변경 시 즉시 반영.
  const fontPack = getFontPack(options.fontPack);
  const fontVars = {
    "--paper-font-serif": fontPack.serif,
    "--paper-font-sans": fontPack.sans,
  } as CSSProperties;

  const templateNode = (() => {
    switch (options.template) {
      case "pyeongga":
        return <PyeonggaTemplate {...props} />;
      case "jeongtong":
        return <JeongtongTemplate {...props} />;
      case "modern":
        return <ModernTemplate {...props} />;
      case "workbook":
        return <WorkbookTemplate {...props} />;
      case "jaseup":
        return <JaseupTemplate {...props} />;
      case "yuhyung":
        return <YuhyungTemplate {...props} />;
      default:
        return <JeongtongTemplate {...props} />;
    }
  })();

  return <div style={fontVars}>{templateNode}</div>;
};

// exportSource 는 향후 ProblemBody 의 tag prop 으로 흐를 예정 (Phase 2 후속).
// 현재 6 template 의 ProblemBody 호출은 `problem={p.variant}` 만 사용.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _exportSourceUnused = (_x: string) => _x;

export default Step5Export;
