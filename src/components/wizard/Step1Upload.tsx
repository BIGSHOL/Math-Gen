import { useRef, useState } from "react";
import {
  Btn,
  Card,
  Chip,
  Eyebrow,
  Heading,
  Icon,
  Progress,
  type ChipTone,
} from "@app/components/ui";
import {
  deletePageImages,
  deleteThumbnails,
  putPageImage,
  putPdfBlob,
  putThumbnail,
} from "@app/lib/imageStore";
import { cn } from "@app/lib/tailwind";
import {
  detectPageRotation,
  isProblemPage,
  loadPdf,
  renderPageForAI,
  renderPageThumbnail,
} from "@app/lib/pdfProcessor";
import {
  useWizardStore,
  type ExamCategory,
  type WizardPage,
} from "@app/stores/wizardStore";
import { deleteIfDraft, insertTest, updateTest } from "@app/services/api/tests";
import { insertPage } from "@app/services/api/pages";
import { removeTestFolder, uploadPdf } from "@app/services/api/storage";
import {
  GRADE_GROUPS,
  GRADE_LABELS,
  type GradeKey,
} from "@app/services/ai/mathDefense";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PAGES = 20;

type Phase = "idle" | "loading" | "rendering" | "done" | "error";

interface PreviewPage {
  pageNum: number;
  thumbnail: string;
}

/**
 * Wizard Step 1 — drop a PDF and we render it into per-page images.
 *
 * Flow:
 *  1. User drops/picks a PDF (.pdf only, ≤50 MB, ≤20 pages enforced).
 *  2. `loadPdf` parses the file via pdfjs-dist (worker from unpkg).
 *  3. For each page we render hi-res for AI (`renderPageForAI`) and a JPEG
 *     thumbnail for the UI. The hi-res base64 goes into IndexedDB; the
 *     wizardStore only sees the ref id.
 *  4. On completion the parent moves us to Step 2 (caller wires that).
 *
 * Failure modes:
 *  - Wrong MIME / extension → reject with toast-equivalent banner.
 *  - >MAX_BYTES → reject with size hint.
 *  - >MAX_PAGES → reject with page hint.
 *  - pdfjs throws → show the message; preserve the file picker for retry.
 */
/** mathlab `ExamUploadForm.tsx` 의 examCategory enum 벤치마킹. */
const EXAM_CATEGORY_OPTIONS: Array<{ value: ExamCategory; label: string }> = [
  { value: "MIDTERM", label: "중간고사" },
  { value: "FINAL", label: "기말고사" },
  { value: "MOCK", label: "모의고사" },
  { value: "OTHER", label: "기타" },
];

export const Step1Upload = ({ onComplete }: { onComplete: () => void }) => {
  const setUploadedFile = useWizardStore((s) => s.setUploadedFile);
  const setPages = useWizardStore((s) => s.setPages);
  const uploadedFileName = useWizardStore((s) => s.uploadedFileName);
  const persistedPages = useWizardStore((s) => s.pages);
  const selectedGrade = useWizardStore((s) => s.selectedGrade);
  const setSelectedGrade = useWizardStore((s) => s.setSelectedGrade);
  const examCategory = useWizardStore((s) => s.examCategory);
  const setExamCategory = useWizardStore((s) => s.setExamCategory);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>(uploadedFileName ? "done" : "idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [previews, setPreviews] = useState<PreviewPage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return "PDF 파일만 업로드할 수 있습니다.";
    }
    if (file.size > MAX_BYTES) {
      return `파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)} MB). 최대 50 MB.`;
    }
    return null;
  };

  const onFile = async (file: File) => {
    setError(null);
    const fail = validate(file);
    if (fail) {
      setError(fail);
      return;
    }
    setPhase("loading");
    try {
      const pdf = await loadPdf(file);
      if (pdf.numPages > MAX_PAGES) {
        setError(`페이지가 너무 많습니다 (${pdf.numPages}장). 최대 ${MAX_PAGES}장.`);
        setPhase("error");
        return;
      }
      setPhase("rendering");
      setProgress({ done: 0, total: pdf.numPages });
      setUploadedFile(file.name);

      // ── Phase B: testId 발급 + tests row 즉시 insert (status="draft").
      // client-side 발급 UUID 를 DB 의 tests.id 로 사용 → pages / ocr_problems
      // 의 FK 는 모두 이 testId. SUPABASE_ENABLED=false 면 insertTest 가 null
      // 반환 — wizard 는 IndexedDB only 로 그대로 진행.
      const testId = crypto.randomUUID();
      useWizardStore.setState({ testId });
      const title = file.name.replace(/\.pdf$/i, "");
      void insertTest({
        id: testId,
        title,
        grade: selectedGrade,
        exam_category: examCategory,
        problem_count: 0,
        status: "draft",
        status_text: "업로드 중",
        tags: [],
        uploaded_file_name: file.name,
      }).catch((err) => console.warn("[Step1Upload] insertTest failed:", err));

      // PDF 원본 — IndexedDB + Supabase Storage dual-write (둘 다 background).
      void putPdfBlob(testId, file).catch((err) =>
        console.warn("[Step1Upload] putPdfBlob failed:", err),
      );
      void uploadPdf(testId, file).catch((err) =>
        console.warn("[Step1Upload] uploadPdf failed:", err),
      );

      const pages: WizardPage[] = [];
      const previewBatch: PreviewPage[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        // Hi-res image + text layer + low-res thumbnail rendered in parallel,
        // but we MUST await all IndexedDB writes before pushing to `pages` —
        // usePageOcr will reach for these refs as soon as setPages fires.
        const [{ imageBase64, textLayer }, thumb, rotation] = await Promise.all([
          renderPageForAI(pdf, p, 2.0),
          renderPageThumbnail(pdf, p),
          detectPageRotation(pdf, p),
        ]);
        const [imageRef, thumbRef] = await Promise.all([
          putPageImage({ pageNum: p, dataUrl: imageBase64 }),
          putThumbnail({ pageNum: p, dataUrl: thumb }),
        ]);
        const wizPage: WizardPage = {
          id: crypto.randomUUID(),
          imageRef,
          thumbRef,
          textLayer,
          isProblemPage: isProblemPage(textLayer),
          ocrResult: [],
          ocrComplete: false,
          rotation,
        };
        pages.push(wizPage);
        // ── Phase B: pages row + Storage upload (둘 다 background — 실패해도
        // IndexedDB 가 backup. UI 진행은 IndexedDB put 완료 기준이라 await X).
        void insertPage(testId, p, wizPage, imageBase64, thumb).catch((err) =>
          console.warn(`[Step1Upload] insertPage p=${p} failed:`, err),
        );
        previewBatch.push({ pageNum: p, thumbnail: thumb });
        setPreviews([...previewBatch]);
        setProgress({ done: p, total: pdf.numPages });
      }
      // Single setPages call only AFTER every put*-await above has resolved —
      // this is what prevents usePageOcr from racing the IndexedDB writes.
      setPages(pages);
      // problem_count 추정치 (페이지당 ~5문항) + status 텍스트 업데이트.
      const estCount = pages.filter((p) => p.isProblemPage).length * 5;
      void updateTest(testId, {
        problem_count: estCount,
        status_text: "OCR 대기",
      }).catch((err) => console.warn("[Step1Upload] updateTest failed:", err));
      setPhase("done");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Step1Upload]", err);
      setError(`PDF 처리 중 오류가 발생했습니다: ${(err as Error).message}`);
      setPhase("error");
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void onFile(file);
  };

  /**
   * "다시 업로드" 핸들러 — 로컬 컴포넌트 state 뿐 아니라 *store* (uploadedFileName,
   * pages) 와 *IndexedDB* (pageImages / pageThumbnails) 까지 같이 비운다.
   *
   * 이전 버그: 로컬 state 만 비우니 `persistedPages.length > 0` 가 true 인
   * 채로 남아 `showFinished` 가 계속 true → "완료" 카드가 안 사라지고
   * 드롭존이 안 나타나서 사용자 입장에서 버튼이 작동 안 하는 것처럼 보였음.
   */
  const reset = async () => {
    // 이전 페이지의 IndexedDB 잔존 데이터 정리 — 새로 업로드하기 전에
    // 메모리·디스크 공간 회수. 실패해도 무시 (best-effort cleanup).
    if (persistedPages.length > 0) {
      const imageRefs = persistedPages.map((p) => p.imageRef).filter(Boolean);
      const thumbRefs = persistedPages.map((p) => p.thumbRef).filter(Boolean);
      try {
        await Promise.all([deletePageImages(imageRefs), deleteThumbnails(thumbRefs)]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[Step1Upload] reset: IndexedDB cleanup partial failure", err);
      }
    }
    // ── Phase B: draft 상태의 Supabase row + Storage 파일 cleanup. status 가
    // "ok" / "warn" 으로 이미 commit 된 시험지는 *건드리지 않음* — library 에
    // 보존. deleteIfDraft 안에서 status 확인.
    const prevTestId = useWizardStore.getState().testId;
    if (prevTestId) {
      void deleteIfDraft(prevTestId).then((deleted) => {
        if (deleted) void removeTestFolder(prevTestId);
      }).catch((err) =>
        console.warn("[Step1Upload] reset: draft cleanup failed:", err),
      );
    }
    // Zustand 의 setState 로 한 번에 여러 필드 reset — 별도 setter 추가 안 함.
    useWizardStore.setState({
      testId: null,
      uploadedFileName: null,
      pages: [],
      activePageIndex: 0,
      uploadProgress: 0,
    });
    // 로컬 UI state 도 리셋.
    setPhase("idle");
    setError(null);
    setProgress({ done: 0, total: 0 });
    setPreviews([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const showFinished = phase === "done" || (phase === "idle" && persistedPages.length > 0);
  // 완료 카드용 진행 통계 — 사용자 보고: 새로고침 후 progress.total = 0 으로
  // 리셋돼서 "0 페이지" 로 표시되던 버그. persistedPages 에서 직접 계산해야
  // refresh-safe. OCR / 해설 진행 상황도 같이 보여줘서 Step 2 / Step 3 안 들어
  // 가도 한눈에 파악 가능.
  const totalPageCount =
    phase === "done" && progress.total > 0 ? progress.total : persistedPages.length;
  const problemPages = persistedPages.filter((p) => p.isProblemPage || p.forceOcr);
  const ocrDoneCount = problemPages.filter((p) => p.ocrComplete && !p.ocrError).length;
  const ocrErrorCount = problemPages.filter((p) => !!p.ocrError).length;
  const allItems = persistedPages.flatMap((p) => p.ocrResult);
  const solutionEligible = allItems.filter((it) => !!it.text && !it.bodyMissing);
  const solutionDoneCount = solutionEligible.filter((it) => !!it.solution).length;
  const solutionErrorCount = solutionEligible.filter((it) => !!it.solutionError).length;

  // 전체 상태 한 줄로 — OCR/해설 모두 정상 완료면 "완료" (ok), 오류 있으면
  // "일부 오류" (danger), 아직 진행 중이면 "진행 중" (warn). idle 상태에서
  // persistedPages 만 남고 OCR 아직 안 한 경우는 "대기" (neutral).
  const anyError = ocrErrorCount > 0 || solutionErrorCount > 0;
  const ocrAllDone = problemPages.length > 0 && ocrDoneCount === problemPages.length;
  const solutionAllDone =
    solutionEligible.length > 0 && solutionDoneCount === solutionEligible.length;
  const statusChip: { tone: ChipTone; label: string } = anyError
    ? { tone: "danger", label: "일부 오류" }
    : ocrAllDone && solutionAllDone
      ? { tone: "ok", label: "완료" }
      : ocrDoneCount > 0 || solutionDoneCount > 0
        ? { tone: "warn", label: "진행 중" }
        : { tone: "neutral", label: "대기" };

  return (
    <div className="max-w-[920px] mx-auto px-6 py-8">
      <Heading
        level="h1"
        sub="PDF를 업로드하면 페이지별 이미지로 변환합니다. 최대 50 MB · 20 페이지."
      >
        시험지 업로드
      </Heading>

      {/* 학년·시험 종류 selector — 해설 생성 시 학년별 mathDefense fragment 가
          prompt 에 inject 됨. mathlab ExamUploadForm.tsx 벤치마킹. 선택 즉시
          wizardStore 에 저장 → sessionStorage 영속화 (새로고침 후 유지). */}
      <div className="mt-5">
        <Eyebrow className="mb-2">학년 · 과목 (선택 사항)</Eyebrow>
        <div className="space-y-2">
          {GRADE_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-2 flex-wrap">
              <span className="text-caption text-muted w-8 flex-shrink-0">{group.label}</span>
              {group.items.map((key) => (
                <SelectablePill
                  key={key}
                  active={selectedGrade === key}
                  onClick={() => setSelectedGrade(selectedGrade === key ? null : key)}
                >
                  {GRADE_LABELS[key]}
                </SelectablePill>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <Eyebrow className="mb-2">시험 종류 (선택 사항)</Eyebrow>
        <div className="flex items-center gap-2 flex-wrap">
          {EXAM_CATEGORY_OPTIONS.map((opt) => (
            <SelectablePill
              key={opt.value}
              active={examCategory === opt.value}
              onClick={() =>
                setExamCategory(examCategory === opt.value ? null : opt.value)
              }
            >
              {opt.label}
            </SelectablePill>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 px-4 py-3 rounded-r2 border border-[#FECACA] bg-danger-soft text-[#991B1B] text-small flex items-center gap-2">
          <Icon name="warning" size={16} weight="bold" />
          {error}
        </div>
      )}

      {!showFinished && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            "mt-5 border-2 border-dashed rounded-r4 p-12 text-center transition-all duration-[140ms] ease-out",
            "bg-surface",
            dragOver
              ? "border-accent shadow-accent-glow bg-accent-soft/40"
              : "border-line-strong hover:border-accent",
            (phase === "loading" || phase === "rendering") && "pointer-events-none opacity-90",
          )}
        >
          <div
            className="mx-auto grid place-items-center text-accent"
            style={{
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "rgba(14, 165, 233, 0.1)",
            }}
          >
            <Icon name="file-pdf" size={28} weight="duotone" />
          </div>
          <div className="mt-4 text-h2 text-text">PDF 파일을 끌어다 놓으세요</div>
          <div className="mt-1 text-small text-muted">
            또는 아래 버튼으로 파일을 선택하세요
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <Btn
              kind="accent"
              icon="folder-open"
              onClick={() => inputRef.current?.click()}
              disabled={phase === "loading" || phase === "rendering"}
            >
              파일 선택
            </Btn>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {(phase === "loading" || phase === "rendering") && (
            <div className="mt-7 max-w-md mx-auto">
              <Progress
                value={progress.done}
                max={progress.total || 1}
                tone="accent"
                label={
                  <>
                    <span className="text-text2">
                      {phase === "loading" ? "PDF 분석 중…" : "페이지 렌더링"}
                    </span>
                    <span className="text-muted font-mono">
                      {progress.done} / {progress.total || "…"}
                    </span>
                  </>
                }
              />
            </div>
          )}
        </div>
      )}

      {showFinished && (
        <Card pad={20} className="mt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="grid place-items-center text-accent flex-shrink-0"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 8,
                  background: "rgba(14, 165, 233, 0.1)",
                }}
              >
                <Icon name="file-pdf" size={22} weight="duotone" />
              </div>
              <div className="min-w-0">
                <div className="text-h3 text-text truncate">
                  {uploadedFileName ?? "업로드된 PDF"}
                </div>
                <div className="mt-0.5 text-small text-muted flex items-center gap-2 flex-wrap">
                  <Chip tone={statusChip.tone} size="sm" dot>
                    {statusChip.label}
                  </Chip>
                  <span>{totalPageCount} 페이지</span>
                  {problemPages.length > 0 && (
                    <>
                      <span className="text-line-strong">·</span>
                      <span>
                        문항 인식 {ocrDoneCount}/{problemPages.length}
                        {ocrErrorCount > 0 && (
                          <span className="text-danger ml-1">(오류 {ocrErrorCount})</span>
                        )}
                      </span>
                    </>
                  )}
                  {solutionEligible.length > 0 && (
                    <>
                      <span className="text-line-strong">·</span>
                      <span>
                        해설 {solutionDoneCount}/{solutionEligible.length}
                        {solutionErrorCount > 0 && (
                          <span className="text-danger ml-1">(오류 {solutionErrorCount})</span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Btn kind="ghost" icon="arrow-counter-clockwise" onClick={reset}>
              다시 업로드
            </Btn>
          </div>

          {previews.length > 0 && (
            <div className="mt-5">
              <Eyebrow className="mb-2.5">페이지 미리보기</Eyebrow>
              <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-6 md:grid-cols-8">
                {previews.map((p) => (
                  <div
                    key={p.pageNum}
                    className="border border-line rounded-r1 overflow-hidden bg-white"
                    style={{ aspectRatio: "3/4" }}
                  >
                    <img
                      src={p.thumbnail}
                      alt={`Page ${p.pageNum}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Btn kind="accent" iconRight="arrow-right" onClick={onComplete}>
              OCR 단계로
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Step1Upload;

/**
 * 학년·시험종류 selector 의 단일 pill. Chip 컴포넌트는 span 으로만 렌더돼
 * onClick 지원 X — 직접 button 으로 chip-style 렌더링.
 *
 * 같은 그룹 안에서 *단일 선택* — 이미 선택된 pill 을 다시 누르면 해제 (toggle).
 */
const SelectablePill = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "px-3 py-1 rounded-full border text-small font-medium transition-colors whitespace-nowrap",
      active
        ? "bg-accent text-white border-accent shadow-sm"
        : "bg-surface text-text2 border-line hover:border-accent",
    )}
    aria-pressed={active}
  >
    {children}
  </button>
);
