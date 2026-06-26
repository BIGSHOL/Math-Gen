import { useCallback, useState, type RefObject } from "react";
import { Backdrop, Btn, Card, Heading, Icon, Input, Progress } from "@app/components/ui";
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
const HWP_AGENT_DOWNLOAD_URL =
  "https://github.com/BIGSHOL/Math-Gen/releases/latest/download/MathGenHWP.zip";

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
  // HWP 변환 중에는 한글 COM 이 저장 직전 잠깐 Visible 로 떠 포커스를 가로챌 수 있어
  // 타이핑이 변환을 깨뜨릴 위험 → 가운데 경고 모달로 상호작용 차단(사용자 보고 2026-06-22).
  const hwpConverting = isExporting && exportKind === "hwp";
  // 커넥터(HWP 도우미) 미감지 → 다운로드 안내 카드 노출.
  const [connectorMissing, setConnectorMissing] = useState(false);
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
            "서버 PDF 기능은 배포 환경에서만 동작합니다. 개발 중에는 '인쇄 · PDF로 저장'을 사용하세요.",
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

  /**
   * HWP 내보내기 — 로컬 커넥터(127.0.0.1) 경유. 브라우저가 직접 loopback 호출
   * → 커넥터가 markdown payload 를 ExamDocument 로 변환 → .hwp/.hwpx 반환.
   * 커넥터 미실행이면 안내. 401(페어링 토큰)이면 1회 prompt 후 localStorage 저장.
   */
  const handleHWP = useCallback(async () => {
    setExportKind("hwp");
    setConnectorMissing(false);
    // 진행 중 입력 필드 등에서 포커스 제거 — 변환 중 stray 키 입력 방지.
    (document.activeElement as HTMLElement | null)?.blur?.();
    setProgress({ current: 0, total: totalPages, phase: "preparing" });
    try {
      const {
        detectConnector,
        buildHwpPayload,
        convertToHwp,
        getStoredToken,
        setStoredToken,
        HwpConnectorError,
      } = await import("@app/services/api/hwpConnector");

      const health = await detectConnector();
      if (!health) {
        // 커넥터 미실행 — 에러 throw 대신 다운로드 안내 카드 노출(사용자 친화).
        setConnectorMissing(true);
        setProgress(null);
        setExportKind(null);
        return;
      }
      if (problems.length === 0) throw new Error("내보낼 문항이 없습니다.");

      const payload = buildHwpPayload(problems, meta, exportSource, printOptions);
      const ext = health.engine === "hwp" ? "hwp" : "hwpx";
      const { sanitizeFilename } = await import("@app/lib/filename");
      // 내보내기 파일명은 *파일명 입력값* 이 단일 소스(Step5Export 가 원본 업로드명으로
      // 자동 입력 → 사용자가 수정 가능). PDF 경로와 동일 우선순위. 비어 있을 때만 원본
      // 업로드명 → 기본값 폴백. 확장자만 .hwp/.hwpx, 동일 이름은 브라우저가 (1)(2) 자동.
      const baseName =
        filename || uploadedFileName?.replace(/\.pdf$/i, "").trim() || DEFAULT_EXPORT_FILENAME;
      const safeName = sanitizeFilename(baseName);

      setProgress({ current: 0, total: totalPages, phase: "saving" });
      let blob: Blob;
      try {
        blob = await convertToHwp(payload, getStoredToken());
      } catch (e) {
        if (e instanceof HwpConnectorError && e.status === 401) {
          const entered = window.prompt(
            "HWP 커넥터 페어링 토큰을 입력하세요\n(%LOCALAPPDATA%\\mathgen-connector\\token.txt 의 값):",
            "",
          );
          if (!entered || !entered.trim()) throw new Error("페어링 토큰이 필요합니다.");
          setStoredToken(entered.trim());
          blob = await convertToHwp(payload, entered.trim());
        } else {
          throw e;
        }
      }
      downloadBlob(blob, `${safeName}.${ext}`);
      setProgress({ current: totalPages, total: totalPages, phase: "done" });
    } catch (err) {
      const msg = (err as Error).message ?? "HWP 변환 실패";
      setProgress({ current: 0, total: totalPages, phase: "error", error: msg });
      // 변환 실패 — 중앙 경고 모달은 닫히고 사이드 진행카드는 3초 뒤 사라지므로,
      // 토스트로 확실히 알린다(한글 오류 등 실패 인지, 사용자 보고 2026-06-22).
      showToast({ kind: "error", message: `HWP 변환 실패 — ${msg}` });
    } finally {
      setTimeout(() => {
        setProgress(null);
        setExportKind(null);
      }, 3000);
    }
  }, [problems, meta, exportSource, printOptions, filename, uploadedFileName, totalPages]);

  return (
    <>
      {/* 변환 중 가운데 경고 모달 — 한글 COM 포커스 탈취 → 타이핑 시 변환 실패 방지.
          Backdrop 이 fullscreen dim+blur 로 상호작용을 시각 차단. 완료/에러 시
          isExporting=false → 자동 사라짐. */}
      {hwpConverting && (
        <Backdrop>
          <Card
            pad={24}
            className="w-[360px] max-w-[90vw] bg-surface border border-accent/40 shadow-2xl text-center"
          >
            <div className="flex flex-col items-center gap-3">
              <span
                className="inline-block w-9 h-9 rounded-full border-[3px] border-accent/25 border-t-accent animate-spin"
                aria-hidden
              />
              <Heading level="h3" className="text-text">
                HWP 변환 중입니다
              </Heading>
              <p className="text-small text-text2 leading-relaxed">
                한글(HWP)이 백그라운드에서 실행 중입니다.
                <br />
                변환이 끝날 때까지{" "}
                <strong className="text-warn">타이핑하거나 클릭하지 마세요.</strong>
                <br />
                키 입력이 한글 창에 들어가면 변환이 실패할 수 있습니다.
              </p>
              <div className="flex items-center gap-1.5 text-caption text-muted mt-1">
                <Icon name="hourglass-medium" size={14} weight="duotone" color="#0EA5E9" />
                <span>보통 5~30초 소요…</span>
              </div>
            </div>
          </Card>
        </Backdrop>
      )}
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
              {progress.phase === "saving" &&
                (exportKind === "hwp" ? "HWP 변환 중… (한글 실행 중)" : "PDF 저장 중…")}
              {progress.phase === "done" &&
                (exportKind === "hwp" ? "✓ HWP 생성 완료" : "✓ PDF 생성 완료")}
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

        {/* 커넥터 미감지 — HWP 도우미 다운로드 안내 (한글 설치 PC 1회 설치). */}
        {connectorMissing && (
          <Card pad={12} className="bg-warn-soft border-warn/30">
            <div className="text-caption font-bold mb-1.5">
              HWP 내보내기 도우미가 필요합니다
            </div>
            <p className="text-caption text-text2 leading-relaxed mb-2">
              .hwp 변환은 PC에 설치된 한글(HWP)을 이용합니다. 아래 도우미를 한 번
              설치하면 이후 자동 실행됩니다.
            </p>
            <Btn
              kind="accent"
              icon="download-simple"
              full
              size="sm"
              onClick={() =>
                window.open(HWP_AGENT_DOWNLOAD_URL, "_blank", "noopener")
              }
            >
              HWP 도우미 다운로드
            </Btn>
            <Btn
              kind="ghost"
              full
              size="sm"
              className="mt-1.5"
              onClick={() => void handleHWP()}
            >
              이미 설치함 · 다시 시도
            </Btn>
          </Card>
        )}

        {/* HWP 내보내기 — 로컬 커넥터(127.0.0.1) 경유 (Task 5). 이 단계의 주 동작. */}
        <Btn
          kind="accent"
          icon="file-doc"
          iconRight="download-simple"
          full
          onClick={handleHWP}
          disabled={isExporting || problemCount === 0}
        >
          HWP 내보내기
        </Btn>

        {/* HWP 출력 안내 — 한글 자체 레이아웃이라 미리보기와 차이 가능(사용자 결정 2026-06-23:
            정확 미리보기 대신 다운로드 + 안내. PDF·인쇄는 미리보기와 동일). */}
        <p className="text-caption text-text2 leading-relaxed bg-warn-soft/40 border border-warn/20 rounded-r2 px-2.5 py-2">
          <Icon name="info" size={12} weight="duotone" color="#F59E0B" />{" "}
          HWP는 한글 자체 레이아웃이라 <strong>쪽 나눔·간격이 미리보기와 다를 수 있고</strong>,
          도형은 한글에서 직접 붙여넣어야 합니다. (PDF·인쇄는 미리보기와 동일)
        </p>

        {/* 저장 완료 — 보관함 복귀. */}
        <Btn kind="secondary" icon="check-circle" full onClick={handleSaveDone}>
          저장 완료 (보관함으로)
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
                ? "서버 PDF는 배포 환경에서만 동작합니다 — 개발 중엔 아래 '인쇄 · PDF로 저장'을 사용하세요"
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
            인쇄 · PDF로 저장
          </Btn>
          <p className="text-caption text-text2 leading-relaxed">
            <Icon name="info" size={12} weight="duotone" color="#9CA3AF" /> 'PDF 다운로드'는 로그인 후
            바로 .pdf 저장. '인쇄'는 브라우저 대화상자에서 <strong>"PDF로 저장"</strong> 선택.
          </p>
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
    </>
  );
};

export default PrintActionPanel;
