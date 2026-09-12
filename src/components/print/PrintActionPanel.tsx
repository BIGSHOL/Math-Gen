import { useCallback, useState, type RefObject } from "react";
import { Btn, Card, Heading, Icon, Input, Progress } from "@app/components/ui";
import { FeedbackBar } from "@app/components/feedback/FeedbackBar";
import { useWizardStore, DEFAULT_EXPORT_FILENAME } from "@app/stores/wizardStore";
import { useAppStore } from "@app/stores/appStore";
import { showToast } from "@app/stores/toastStore";
import type { ExportProgress } from "@app/lib/pdfExporter";
import type { ProblemReview } from "@app/stores/wizardStore";
import type { PrintMeta } from "@app/components/print/types";

/**
 * Step 5 우측 액션 패널. filename input + 페이지 요약 + 인쇄/PDF 버튼 +
 * 진행률 표시 + 이전 단계 버튼.
 *
 * **PDF 다운로드 2 경로**:
 *   - **서버 PDF** (`handleServerPDF`) → `/api/export-pdf` (Puppeteer headless
 *     Chromium). KaTeX·SVG·웹폰트 100% 정확. 권장 path.
 *   - **클라이언트 PDF** (`handlePDF`) → html2canvas + jsPDF. 오프라인 fallback.
 *     CLAUDE.md §19-4 — KaTeX 깨짐 위험.
 *
 * **dynamic import 패턴**: PDF 안 쓰는 사용자에게 jspdf/html2canvas (~150KB
 * gzip) 비용 zero. `handlePDF` 안에서 `await import("@app/lib/pdfExporter")`.
 */

/**
 * 같은 origin 의 `<link rel="stylesheet">` 들의 절대 URL 수집. 서버 Puppeteer
 * 가 fetch 해서 같은 styling 으로 렌더. 외부 도메인 CSS (CDN 등) 는 puppeteer
 * 가 직접 알아서 fetch 하므로 보내지 않아도 OK.
 */
const collectStylesheetUrls = (): string[] => {
  const origin = window.location.origin;
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => (l as HTMLLinkElement).href)
    .filter((href) => href.startsWith(origin));
};

/** Blob → 임시 anchor → click → cleanup. 자동 다운로드 트리거. */
const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Safari 가 fetch 끝나기 전 revoke 하면 download 가 cancel — 약간 지연 후.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** HWP 도우미(로컬 커넥터) 다운로드 — 한글 설치된 PC 에서 1회 설치 후 자동 실행.
 *  버전 무관 latest URL — 새 도우미 릴리스를 latest 로 올리면 코드 수정 없이 자동 반영
 *  (에셋명 MathGenHWP.zip 고정 필수). 릴리스 런북은 CLAUDE.md §36. */

export interface PrintActionPanelProps {
  /** Step5Export 의 printable-root ref. PDF 캡처 대상. */
  printableRootRef: RefObject<HTMLDivElement | null>;
  /** 전체 페이지 수 (문제 + 정답 페이지 합). */
  totalPages: number;
  /** 문제 페이지 수. */
  problemPages: number;
  /** 정답 페이지 수 (없으면 0). */
  answerPages: number;
  /** 문항 총 개수. */
  problemCount: number;
  /** 내보내기 대상 문항 — HWP payload 빌드용. */
  problems: ProblemReview[];
  /** 시험지 메타 (제목·학년·과목) — HWP meta. */
  meta: PrintMeta;
  /** 출력 대상 (original|variant|both). */
  exportSource: string;
  className?: string;
}

export const PrintActionPanel = ({
  printableRootRef,
  totalPages,
  problemPages,
  answerPages,
  problemCount,
  problems,
  meta,
  exportSource,
  className,
}: PrintActionPanelProps) => {
  const filename = useWizardStore((s) => s.filename);
  const uploadedFileName = useWizardStore((s) => s.uploadedFileName);
  const printOptions = useWizardStore((s) => s.printOptions);
  const setExport = useWizardStore((s) => s.setExport);
  const prev = useWizardStore((s) => s.prev);
  const backToLibrary = useAppStore((s) => s.backToLibrary);

  // 저장 완료 — 내보내기 단계의 마무리 (사용자 보고 2026-06-02). 다운로드가
  // 구현중이라 이 단계의 주 동작은 "저장하고 보관함으로". 위자드는 이미
  // sessionStorage + Supabase 로 auto-save 되므로 보관함 복귀 = 저장 완료.
  const handleSaveDone = useCallback(() => {
    showToast({ kind: "success", message: "시험지가 보관함에 저장되었습니다." });
    backToLibrary();
  }, [backToLibrary]);

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const isExporting = progress !== null && progress.phase !== "done" && progress.phase !== "error";
  // 어떤 내보내기가 진행 중인지 — 진행 라벨·경고 모달이 PDF vs HWP 를 구분.
  const [exportKind, setExportKind] = useState<"hwp" | "pdf" | null>(null);
  const [hwpError, setHwpError] = useState('');
  const testId = useWizardStore((s) => s.testId);

  const handlePrint = useCallback(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => res())),
    );
    window.print();
  }, []);

  const handlePDF = useCallback(async () => {
    if (!printableRootRef.current) {
      setProgress({ current: 0, total: 0, phase: "error", error: "인쇄 영역을 찾을 수 없습니다." });
      return;
    }
    setExportKind("pdf");
    setProgress({ current: 0, total: totalPages, phase: "preparing" });
    try {
      // dynamic import — PDF 안 쓰는 사용자에게 비용 zero.
      const { exportPDF, sanitizeFilename } = await import("@app/lib/pdfExporter");
      await exportPDF({
        root: printableRootRef.current,
        filename: `${sanitizeFilename(filename || "변형시험지")}.pdf`,
        onProgress: setProgress,
      });
    } catch (err) {
      setProgress({
        current: 0,
        total: totalPages,
        phase: "error",
        error: (err as Error).message ?? "알 수 없는 오류",
      });
    } finally {
      // 2초 후 progress 클리어 — 완료/에러 모두.
      setTimeout(() => {
        setProgress(null);
        setExportKind(null);
      }, 2500);
    }
  }, [filename, printableRootRef, totalPages]);

  /**
   * 서버 PDF 경로 — `/api/export-pdf` (Puppeteer headless Chromium).
   *
   * **흐름**:
   *   1. printable-root outerHTML + 같은 origin stylesheet URLs 수집
   *   2. POST `/api/export-pdf` → PDF binary 반환
   *   3. Blob → `URL.createObjectURL` → 임시 `<a>` click 자동 다운로드
   *
   * **장점**: KaTeX SVG/woff2 폰트 + 원본 diagram dataUrl + Tailwind CSS 모두
   * Chromium 으로 직접 렌더 → 100% 정확. 클라이언트 path 의 html2canvas 깨짐
   * 함정 (CLAUDE.md §19-4) 회피.
   */
  const handleServerPDF = useCallback(async () => {
    if (!printableRootRef.current) {
      setProgress({ current: 0, total: 0, phase: "error", error: "인쇄 영역을 찾을 수 없습니다." });
      return;
    }
    setExportKind("pdf");
    setProgress({ current: 0, total: totalPages, phase: "preparing" });
    try {
      const { sanitizeFilename } = await import("@app/lib/filename");
      const { currentAccessToken } = await import("@app/services/api/supabase");
      const html = printableRootRef.current.outerHTML;
      const cssUrls = collectStylesheetUrls();
      const safeName = sanitizeFilename(filename || "변형시험지");
      const token = await currentAccessToken();
      if (!token) {
        throw new Error("로그인 후 PDF를 생성할 수 있습니다.");
      }

      setProgress({ current: 0, total: totalPages, phase: "saving" });
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ html, cssUrls, title: safeName }),
      });
      if (!res.ok) {
        // 404 = /api 서버리스 함수 부재(dev/비-Vercel). 혼란스러운 raw 404 대신 명확 안내.
        if (res.status === 404) {
          throw new Error(
            "PDF 다운로드는 배포 환경에서 사용할 수 있습니다. 개발 중에는 인쇄를 이용하세요.",
          );
        }
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      downloadBlob(blob, `${safeName}.pdf`);
      setProgress({ current: totalPages, total: totalPages, phase: "done" });
    } catch (err) {
      setProgress({
        current: 0,
        total: totalPages,
        phase: "error",
        error: (err as Error).message ?? "서버 PDF 생성 실패",
      });
    } finally {
      setTimeout(() => {
        setProgress(null);
        setExportKind(null);
      }, 2500);
    }
  }, [filename, printableRootRef, totalPages]);

  const handleHWP = useCallback(async () => {
    setExportKind("hwp"); setHwpError("");
    setProgress({ current: 0, total: totalPages, phase: "preparing" });
    try {
      if (!printableRootRef.current) throw new Error("미리보기 페이지를 찾을 수 없습니다.");
      const { exportPreviewHwpx } = await import("@app/services/api/hwpxExport");
      const { sanitizeFilename } = await import("@app/lib/filename");
      const safeName = sanitizeFilename(filename || uploadedFileName?.replace(/\.pdf$/i, "") || DEFAULT_EXPORT_FILENAME);
      const blob = await exportPreviewHwpx(printableRootRef.current, safeName);
      downloadBlob(blob, `${safeName}.hwpx`);
      setProgress({ current: totalPages, total: totalPages, phase: "done" });
    } catch (error) {
      const message = (error as Error).message || "HWPX 생성에 실패했습니다.";
      setHwpError(message);
      setProgress({ current: 0, total: totalPages, phase: "error", error: message });
    }
  }, [filename, uploadedFileName, printableRootRef, totalPages]);

  return (
    <>
      <aside
        className={`w-[280px] shrink-0 bg-surface border-l border-line flex flex-col ${className ?? ""}`}
      >
      <div className="h-14 flex items-center px-4 border-b border-line">
        <Heading level="h3" className="text-body">
          <Icon name="download-simple" size={16} weight="duotone" color="#0EA5E9" />
          <span className="ml-2">내보내기</span>
        </Heading>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 파일명 */}
        <div>
          <label className="text-caption font-semibold uppercase tracking-wider text-muted block mb-1.5">
            파일명
          </label>
          <Input
            size="sm"
            value={filename}
            onChange={(e) => setExport({ filename: e.target.value })}
            suffix=".hwpx / .pdf"
            placeholder="변형시험지"
            aria-label="파일명"
            mono
          />
        </div>

        {/* 페이지 요약 */}
        <Card pad={12} className="bg-surface2 border-0">
          <div className="space-y-1.5">
            <div className="flex justify-between text-small">
              <span className="text-muted">총 페이지</span>
              <span className="font-bold text-text">{totalPages}</span>
            </div>
            <div className="flex justify-between text-caption">
              <span className="text-muted">- 문제 페이지</span>
              <span className="font-mono text-text2">{problemPages}</span>
            </div>
            {answerPages > 0 && (
              <div className="flex justify-between text-caption">
                <span className="text-muted">- 정답·해설</span>
                <span className="font-mono text-text2">{answerPages}</span>
              </div>
            )}
            <div className="flex justify-between text-caption pt-1 border-t border-line">
              <span className="text-muted">문항 수</span>
              <span className="font-mono text-text2">{problemCount}</span>
            </div>
          </div>
        </Card>

        {/* 진행률 */}
        {progress && (
          <Card
            pad={12}
            className={
              progress.phase === "error"
                ? "bg-warn-soft border-warn/30"
                : progress.phase === "done"
                ? "bg-ok-soft border-ok/30"
                : "bg-accent-soft border-accent/30"
            }
          >
            <div className="text-caption font-bold mb-1.5">
              {progress.phase === "preparing" && "준비 중…"}
              {progress.phase === "rendering" &&
                `${progress.current} / ${progress.total} 페이지 캡처 중…`}
              {progress.phase === "saving" &&
                (exportKind === "hwp" ? "HWPX 생성 중…" : "PDF 저장 중…")}
              {progress.phase === "done" &&
                (exportKind === "hwp" ? "✓ HWPX 생성 완료" : "✓ PDF 생성 완료")}
              {progress.phase === "error" && `오류: ${progress.error ?? "알 수 없음"}`}
            </div>
            {progress.total > 0 && progress.phase !== "error" && (
              <Progress
                value={progress.current}
                max={progress.total}
                tone={progress.phase === "done" ? "ok" : "accent"}
                height={4}
              />
            )}
          </Card>
        )}

        {hwpError && <p role="alert" className="text-caption text-danger">{hwpError}</p>}
        <Btn
          kind="accent"
          icon="file-doc"
          iconRight="download-simple"
          full
          onClick={handleHWP}
          disabled={isExporting || problemCount === 0}
        >
          HWPX 내보내기
        </Btn>

        {/* PDF/인쇄 — §45 PDF 활성화 (2026-06-02 MVP 락다운 해제, PDF 한정).
            Phase 1: 브라우저 인쇄(window.print) 활성 — 미리보기와 동일 벡터 렌더(깨짐 0).
            Phase 2(준비 중): 서버 1-클릭 'PDF 다운로드'(Puppeteer). DOCX 는 후속. */}
        <div className="space-y-2">
          {/* 서버 1-클릭 PDF 다운로드 (Puppeteer) — HWP 처럼 한 번 클릭 → .pdf 다운로드.
              미리보기와 동일 벡터 렌더(Chromium). 로그인 필요(currentAccessToken).
              dev(Vite)는 /api 서버리스 함수가 없어 404 → 개발 중엔 비활성(인쇄로 안내, §23-4). */}
          <Btn
            kind="accent"
            icon="file-pdf"
            iconRight="download-simple"
            full
            onClick={() => void handleServerPDF()}
            disabled={isExporting || problemCount === 0 || import.meta.env.DEV}
            title={
              import.meta.env.DEV
                ? "PDF 다운로드는 배포 환경에서 사용할 수 있습니다. 개발 중에는 인쇄를 이용하세요."
                : undefined
            }
          >
            PDF 다운로드{import.meta.env.DEV ? " (배포 전용)" : ""}
          </Btn>
          {/* 브라우저 인쇄(window.print) — OS 대화상자 → "PDF로 저장". 서버·로그인 불필요. */}
          <Btn
            kind="secondary"
            icon="printer"
            full
            onClick={() => void handlePrint()}
            disabled={isExporting || problemCount === 0}
          >
            인쇄
          </Btn>
          <Btn kind="ghost" icon="file-doc" full disabled>
            DOCX (준비 중)
          </Btn>
        </div>

        {/* 내보내기 품질 피드백 — 👍/👎 (OCR 피드백과 동일 content_feedback 인프라). */}
        <div className="pt-3 border-t border-line">
          <FeedbackBar
            targetKind="export"
            targetId={testId || filename || "export"}
            context={{
              template: printOptions.template,
              columns: printOptions.columns,
              problemCount,
            }}
          />
        </div>
      </div>

      {/* 하단 — 이전 단계 */}
      <div className="border-t border-line p-3 flex items-center gap-2">
        <Btn
          kind="ghost"
          icon="arrow-left"
          size="sm"
          onClick={prev}
          disabled={isExporting}
        >
          이전 (검토)
        </Btn>
        <Btn kind="secondary" size="sm" className="flex-1 px-2" onClick={handleSaveDone} disabled={isExporting}>
          저장 완료 (보관함으로)
        </Btn>
      </div>
      </aside>
    </>
  );
};

export default PrintActionPanel;
