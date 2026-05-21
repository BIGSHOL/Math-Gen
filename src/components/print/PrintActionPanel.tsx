import { useCallback, useState, type RefObject } from "react";
import { Btn, Card, Heading, Icon, Input, Progress } from "@app/components/ui";
import { useWizardStore } from "@app/stores/wizardStore";
import type { ExportProgress } from "@app/lib/pdfExporter";

/**
 * Step 5 우측 액션 패널. filename input + 페이지 요약 + 인쇄/PDF 버튼 +
 * 진행률 표시 + 이전 단계 버튼.
 *
 * Plan §1.6 + §4.5 패턴. mathlab `print/page.tsx` L444-462 의 좌측 하단
 * 인쇄 버튼 패턴 차용 + 우측 액션 패널로 위치 이동.
 *
 * **dynamic import 패턴**: PDF 안 쓰는 사용자에게 jspdf/html2canvas (~150KB
 * gzip) 비용 zero. `handlePDF` 안에서 `await import("@app/lib/pdfExporter")`.
 */

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

        {/* 액션 버튼 */}
        <div className="space-y-2">
          <Btn
            kind="accent"
            icon="file-pdf"
            full
            onClick={handlePDF}
            disabled={isExporting || totalPages === 0}
          >
            PDF 다운로드
          </Btn>
          <Btn
            kind="secondary"
            icon="printer"
            full
            onClick={handlePrint}
            disabled={isExporting || totalPages === 0}
          >
            인쇄 미리보기
          </Btn>
          <Btn kind="ghost" icon="file-doc" full disabled>
            DOCX (준비 중)
          </Btn>
        </div>

        {/* 안내 */}
        <p className="text-caption text-muted leading-relaxed">
          <Icon name="info" size={11} color="#9CA3AF" /> 인쇄와 PDF 가 같은 layout
          으로 출력됩니다. 인쇄 다이얼로그에서 "PDF 로 저장" 도 가능합니다.
        </p>
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
          이전 (Step 4 — 검토)
        </Btn>
      </div>
    </aside>
  );
};

export default PrintActionPanel;
