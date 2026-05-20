import { useRef, useState } from "react";
import {
  Btn,
  Card,
  Chip,
  Eyebrow,
  Heading,
  Icon,
  Progress,
} from "@app/components/ui";
import {
  deletePageImages,
  deleteThumbnails,
  putPageImage,
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
import { useWizardStore, type WizardPage } from "@app/stores/wizardStore";

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
export const Step1Upload = ({ onComplete }: { onComplete: () => void }) => {
  const setUploadedFile = useWizardStore((s) => s.setUploadedFile);
  const setPages = useWizardStore((s) => s.setPages);
  const uploadedFileName = useWizardStore((s) => s.uploadedFileName);
  const persistedPages = useWizardStore((s) => s.pages);

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

      const pages: WizardPage[] = [];
      const previewBatch: PreviewPage[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        // Hi-res image + text layer + low-res thumbnail rendered in parallel,
        // but we MUST await all IndexedDB writes before pushing to `pages` —
        // usePageOcr will reach for these refs as soon as setPages fires.
        // 회전 감지는 PDF.js 메타·textLayer 휴리스틱 둘 다 사용. 모두 로컬
        // (API 비용 없음). 결과는 WizardPage.rotation 에 저장하고, 실제
        // 이미지 변환은 OCR 호출 시점에 usePageOcr 가 applyRotation 으로
        // 적용 — IndexedDB 의 원본은 그대로 둔다.
        const [{ imageBase64, textLayer }, thumb, rotation] = await Promise.all([
          renderPageForAI(pdf, p, 2.0),
          renderPageThumbnail(pdf, p),
          detectPageRotation(pdf, p),
        ]);
        const [imageRef, thumbRef] = await Promise.all([
          putPageImage({ pageNum: p, dataUrl: imageBase64 }),
          putThumbnail({ pageNum: p, dataUrl: thumb }),
        ]);
        pages.push({
          id: `pg-${p}`,
          imageRef,
          thumbRef,
          textLayer,
          isProblemPage: isProblemPage(textLayer),
          ocrResult: [],
          ocrComplete: false,
          rotation,
        });
        previewBatch.push({ pageNum: p, thumbnail: thumb });
        setPreviews([...previewBatch]);
        setProgress({ done: p, total: pdf.numPages });
      }
      // Single setPages call only AFTER every put*-await above has resolved —
      // this is what prevents usePageOcr from racing the IndexedDB writes.
      setPages(pages);
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
    // Zustand 의 setState 로 한 번에 여러 필드 reset — 별도 setter 추가 안 함.
    useWizardStore.setState({
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
  const finishedPageCount = phase === "done" ? progress.total : persistedPages.length;

  return (
    <div className="max-w-[920px] mx-auto px-6 py-8">
      <Heading
        level="h1"
        sub="PDF를 업로드하면 페이지별 이미지로 변환합니다. 최대 50 MB · 20 페이지."
      >
        시험지 업로드
      </Heading>

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
                <div className="mt-0.5 text-small text-muted flex items-center gap-2">
                  <Chip tone="ok" size="sm" dot>
                    완료
                  </Chip>
                  <span>{finishedPageCount} 페이지 · IndexedDB에 저장</span>
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
