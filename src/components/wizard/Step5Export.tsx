import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { Btn, Heading, Icon } from "@app/components/ui";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";
import { useWizardStore } from "@app/stores/wizardStore";
import {
  paginateAnswerKey,
  type PaginatedAnswerPage,
} from "@app/lib/printLayout";
import { usePrintLayout } from "@app/hooks/usePrintLayout";
import { buildDigitizeReviews } from "@app/lib/problemAdapter";
import type { PackedPage } from "@app/lib/printPack";
import { usePreviewScale, A4_HEIGHT_PX, A4_WIDTH_PX } from "@app/hooks/usePreviewScale";
import { A4Page } from "@app/components/print/A4Page";
import { PrintAnswerKeyPage } from "@app/components/print/PrintAnswerKeyPage";
import { PrintOptionsPanel, ENABLED_EXPORT_SOURCES } from "@app/components/print/PrintOptionsPanel";
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
 * **effect**: bundle.answers seed (mount 1회) — Step3 의 answers 옵션이 켜져
 * 있으면 Step5 진입 시 자동으로 printOptions.showAnswers = true.
 *
 * **레이아웃**: usePrintLayout 이 문항·헤더를 화면 밖에서 실측 → printPack 으로
 * 페이지/컬럼 분할 (measureNode 를 return 트리에 렌더).
 */
export const Step5Export = () => {
  const rawProblems = useWizardStore((s) => s.problems);
  const pages = useWizardStore((s) => s.pages);
  const printOptions = useWizardStore((s) => s.printOptions);
  const exportSource = useWizardStore((s) => s.exportSource);
  const bundle = useWizardStore((s) => s.bundle);
  const filename = useWizardStore((s) => s.filename);
  const testId = useWizardStore((s) => s.testId);
  const selectedGrade = useWizardStore((s) => s.selectedGrade);
  const setExport = useWizardStore((s) => s.setExport);
  const goBackToStep4 = useWizardStore((s) => s.prev);

  // 내보내기 "출력 대상"이 *원본*이면(현재 §33-1 로 항상 original — variant/both 비활성)
  // 저장된 변형 snapshot(rawProblems)이 아니라 *현재 ocrResult* 를 그대로 출력한다.
  // 그러지 않으면:
  //   - 보관함에서 *바로 내보내기*로 진입 → hydrate 된 옛 변형 snapshot
  //     (problem_reviews)의 stale original 이 노출 (사용자 보고 2026-06-04:
  //     OCR 은 7/16 인데 내보내기는 옛 similar 변형 11/36).
  //   - 단계를 이어서 가면 digitize 는 useVariantGen 재시드로 우연히 맞지만,
  //     similar/variant goal + 직접 진입은 안 맞음 → goal 무관 방어 필요.
  // buildDigitizeReviews 는 original===variant 로 만들어 print 경로가 어느 필드를
  // 읽든 현재 OCR 이 나오므로 안전. exportSource 가 variant/both 로 부활(§33-3)하면
  // 그땐 실제 변형 snapshot(rawProblems)이 필요하므로 분기는 유지한다.
  //
  // ENABLED_EXPORT_SOURCES 가드 — 옛 세션의 exportSource=variant/both (현재 비활성)
  // 는 PrintOptionsPanel 의 coerce effect 가 original 로 되돌리기 *전 1프레임* 동안
  // 변형 snapshot 이 노출되는 flash 가 있었음 (전수검사 2026-06-04). 비활성 값이면
  // 즉시 digitize 경로 — 부활 시(disabled 제거) 자동으로 rawProblems 경로 복귀.
  const problems = useMemo(
    () =>
      exportSource !== "original" && ENABLED_EXPORT_SOURCES.includes(exportSource)
        ? rawProblems
        : buildDigitizeReviews(pages),
    [exportSource, pages, rawProblems],
  );

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

  const gradeBadge = selectedGrade ? GRADE_LABELS[selectedGrade] : undefined;
  const testTitle = sourceTest?.title ?? filename ?? "변형 시험지";

  // 시험지 메타 — usePrintLayout(probe 헤더 높이 측정) 과 PageBody(렌더) 가 *동일*
  // 객체 사용. 참조 안정(useMemo) 이라야 측정 key 가 매 렌더 흔들리지 않음.
  const meta: PrintMeta = useMemo(
    () => ({
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
    }),
    [testTitle, gradeBadge],
  );

  // 측정 기반 페이지 분할 — 문항·헤더 실측 후 printPack. measureNode 는 화면 밖에
  // 렌더해야 함 (return 트리에 포함).
  const {
    pages: layoutPages,
    ready: layoutReady,
    measureNode,
  } = usePrintLayout({ problems, options: printOptions, exportSource, meta });

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
  const layoutPending = !layoutReady && layoutPages.length === 0;

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
            {layoutPending ? (
              <div
                className="flex flex-col items-center justify-center gap-3 bg-white shadow-lg border border-slate-200 rounded-sm"
                style={{ width: A4_WIDTH_PX * scale, height: A4_HEIGHT_PX * scale }}
              >
                <div className="w-7 h-7 rounded-full border-2 border-slate-200 border-t-accent animate-spin" />
                <span className="text-small text-muted">레이아웃 계산 중…</span>
              </div>
            ) : (
              <>
                {/* 문제 페이지 — 6 신규 template 이 자체 padding 보유. bare. */}
                {layoutPages.map((page, pageIdx) => (
                  <A4Page key={`q-${pageIdx}`} scale={scale} bare>
                    <PageBody
                      page={page}
                      pageIdx={pageIdx}
                      totalPages={totalPages}
                      meta={meta}
                      options={printOptions}
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
              </>
            )}
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
              meta={meta}
              options={printOptions}
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

      {/* 측정 전용 노드 — 화면 밖(position:fixed). usePrintLayout 이 문항·헤더
          실측 → printPack. 미리보기/인쇄 DOM 과 분리. */}
      {measureNode}
    </div>
  );
};

// ── PageBody — template dispatcher ──────────────────────────────────────
//
// 신규 6 template 의 standalone 컴포넌트가 각자 헤더 + 본문 + 푸터를 자체 통합.
// PageBody 는 *template switch* + props 합성 + 컴포넌트 호출 만 담당.
//
// `page.problems`(읽기순서 flat) + `page.splitIndex`(우측 컬럼 시작) 를 전달 —
// usePrintLayout 의 측정 패킹이 정한 분할을 BodyContainer 가 그대로 적용 (구
// `.flat()` + 개수 절반 분할 모순 해소).
interface PageBodyProps {
  page: PackedPage;
  pageIdx: number;
  totalPages: number;
  meta: PrintMeta;
  options: ReturnType<typeof useWizardStore.getState>["printOptions"];
}

const PageBody = ({ page, pageIdx, totalPages, meta, options }: PageBodyProps) => {
  const props: PrintTemplateProps = {
    page: pageIdx + 1,
    totalPages,
    columns: options.columns,
    meta,
    problems: page.problems,
    startingNumber: page.startingNumber,
    splitIndex: page.splitIndex,
    options,
  };

  // fontPack CSS variable 주입 — 6 template 의 inline `fontFamily: var(...)`
  // 가 이 wrapper 의 변수를 참조. PrintOptionsPanel 의 폰트 옵션 변경 시 즉시 반영.
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

export default Step5Export;
