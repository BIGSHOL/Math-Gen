import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Step 5 PDF 생성 파이프라인. html2canvas 로 페이지별 캡처 → jsPDF 에
 * addImage 로 합쳐 A4 PDF 저장.
 *
 * **핵심 결정사항** (Plan §4):
 *   - `scale: 1.8` — 메모리·품질 trade-off. scale 2.0 은 30 페이지 시 OOM
 *     위험. 1.8 이면 KaTeX 글리프 충분 또렷 + 페이지당 캔버스 ~11MB burst.
 *   - `quality: 0.92` — PNG dataUrl 의 종합 품질. 페이지당 ~600KB. 30 페이지
 *     = ~18MB 최종 PDF (compress: true).
 *   - `foreignObjectRendering: false` — true 가 일부 브라우저에서 SVG 캡처
 *     실패 케이스 더 많음. mathg-gen 의 inline SVG (KaTeX, AI raw SVG) 는
 *     DOM 노드라 그냥 raster 가능.
 *   - `document.fonts.ready` 대기 + raf 2회 — KaTeX 폰트 / Pretendard 로드
 *     완료 보장. CDN 의존 zero (Vite 가 woff2 bundle).
 *   - `canvas.width = 0; canvas.height = 0` — 즉시 메모리 해제. 누적 OOM 방어.
 *
 * **dynamic import 권장**: PDF 안 쓰는 사용자에게 jspdf/html2canvas (~150KB
 * gzip) 비용 zero. 호출처 (PrintActionPanel) 가 `await import(...)` 으로 호출.
 */

export type ExportPhase = "preparing" | "rendering" | "saving" | "done" | "error";

export interface ExportProgress {
  current: number;
  total: number;
  phase: ExportPhase;
  error?: string;
}

export interface ExportPDFInput {
  /** printable-root HTMLElement. 안에 `[data-print-page]` 마커 element 들이 있어야 함. */
  root: HTMLElement;
  /** 저장 파일명 (확장자 .pdf 포함). filename sanitization 은 호출처 책임. */
  filename: string;
  onProgress?: (p: ExportProgress) => void;
  /** html2canvas scale (DPI). 1.8 권장 — 메모리·품질 trade-off. */
  scale?: number;
  /** PNG dataUrl 품질 0..1. 0.92 권장. */
  quality?: number;
}

const A4_MM_W = 210;
const A4_MM_H = 297;

/**
 * 폰트 로드 + 다음 두 프레임 대기. KaTeX 폰트가 늦게 깔리는 케이스 (특히
 * 첫 진입 시) 대응. mathlab 패턴.
 */
async function waitForFonts(): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

export async function exportPDF({
  root,
  filename,
  onProgress,
  scale = 1.8,
  quality = 0.92,
}: ExportPDFInput): Promise<void> {
  onProgress?.({ current: 0, total: 0, phase: "preparing" });
  await waitForFonts();

  const pages = Array.from(root.querySelectorAll<HTMLElement>("[data-print-page]"));
  if (pages.length === 0) {
    throw new Error("인쇄 대상 페이지가 없습니다.");
  }

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  onProgress?.({ current: 0, total: pages.length, phase: "rendering" });

  for (let i = 0; i < pages.length; i++) {
    const el = pages[i];
    void el.offsetHeight; // 강제 reflow

    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      // mathg-gen 의 inline SVG (KaTeX + AI 도형) 모두 raster 가능 — false 안전.
      foreignObjectRendering: false,
      // 미리보기 hidden 상태에서도 캡처되도록 onclone 에서 표시 강제.
      onclone: (clonedDoc) => {
        const clonedRoot = clonedDoc.querySelector("[data-print-root]");
        if (clonedRoot) {
          clonedRoot.classList.remove("hidden");
          (clonedRoot as HTMLElement).style.display = "block";
          (clonedRoot as HTMLElement).style.visibility = "visible";
        }
      },
    });

    const dataUrl = canvas.toDataURL("image/png", quality);
    if (i > 0) pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, 0, A4_MM_W, A4_MM_H, undefined, "FAST");

    // 즉시 메모리 해제 — 30+ 페이지 누적 OOM 방어.
    canvas.width = 0;
    canvas.height = 0;

    onProgress?.({ current: i + 1, total: pages.length, phase: "rendering" });
  }

  onProgress?.({ current: pages.length, total: pages.length, phase: "saving" });
  pdf.save(filename);
  onProgress?.({ current: pages.length, total: pages.length, phase: "done" });
}

/**
 * filename 의 OS 금지 문자 sanitize. 한글은 그대로 둠 (jsPDF.save() 가 unicode
 * filename 지원).
 */
export function sanitizeFilename(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_").trim() || "변형시험지";
}
