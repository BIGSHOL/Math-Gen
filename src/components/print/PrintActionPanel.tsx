import { useCallback, useState, type RefObject } from "react";
import { Btn, Card, Heading, Icon, Input, Progress } from "@app/components/ui";
import { useWizardStore } from "@app/stores/wizardStore";
import { useAppStore } from "@app/stores/appStore";
import { showToast } from "@app/stores/toastStore";
import type { ExportProgress } from "@app/lib/pdfExporter";

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
  className?: string;
}

export const PrintActionPanel = ({
  printableRootRef,
  totalPages,
  problemPages,
  answerPages,
  problemCount,
  className,
}: PrintActionPanelProps) => {
  const filename = useWizardStore((s) => s.filename);
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
      setTimeout(() => setProgress(null), 2500);
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
    setProgress({ current: 0, total: totalPages, phase: "preparing" });
    try {
      const { sanitizeFilename } = await import("@app/lib/pdfExporter");
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
      setTimeout(() => setProgress(null), 2500);
    }
  }, [filename, printableRootRef, totalPages]);

  return (
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
            suffix=".pdf"
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
              {progress.phase === "saving" && "PDF 저장 중…"}
              {progress.phase === "done" && "✓ PDF 생성 완료"}
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

        {/* 저장 완료 — 이 단계의 주 동작 (다운로드 구현중이므로). 누르면 보관함으로. */}
        <Btn kind="accent" icon="check-circle" full onClick={handleSaveDone}>
          저장 완료 (보관함으로)
        </Btn>

        {/* 액션 버튼 — MVP 락다운 (사용자 결정 2026-06-02): 다운로드/저장은 모두
            준비 중. "구현중" 으로 비활성. (handleServerPDF/handlePDF/handlePrint
            로직은 유지 — 추후 활성화 시 onClick 만 복구.) */}
        <div className="space-y-2">
          <Btn kind="accent" icon="file-pdf" full disabled title="준비 중인 기능입니다">
            PDF 다운로드 (구현중)
          </Btn>
          <Btn kind="secondary" icon="printer" full disabled title="준비 중인 기능입니다">
            인쇄 · PDF 저장 (구현중)
          </Btn>
          <Btn kind="ghost" icon="file-doc" full disabled>
            DOCX (구현중)
          </Btn>
        </div>
      </div>

      {/* 하단 — 이전 단계 */}
      <div className="border-t border-line p-3">
        <Btn
          kind="ghost"
          icon="arrow-left"
          full
          size="sm"
          onClick={prev}
          disabled={isExporting}
        >
          이전 (검토)
        </Btn>
      </div>
    </aside>
  );
};

export default PrintActionPanel;
