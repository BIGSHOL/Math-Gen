import type { ReactNode } from "react";
import { A4_WIDTH_PX, A4_HEIGHT_PX } from "@app/hooks/usePreviewScale";

interface A4PageProps {
  scale: number;
  children: ReactNode;
  /** A4 내부 패딩 클래스. 기본 `px-12 py-10` — mathlab 과 동일. */
  paddingClass?: string;
  /**
   * 인쇄 / PDF 페이지 분할 마커. `pdfExporter.ts` 의 querySelector 와
   * `globals.css` 의 `@media print [data-print-page] { page-break-after }`
   * 가 모두 이 attribute 를 기준으로 동작. 기본값 `true` — false 로 주면
   * 미리보기에만 쓰이고 인쇄에서 제외 (드물게 사용).
   */
  pageBreak?: boolean;
  /**
   * `true` 면 paddingClass 무시. 6 신규 template (PyeonggaTemplate 등) 이
   * 자체 padding 을 갖고 있으므로 A4Page 의 wrapper padding 0.
   */
  bare?: boolean;
}

/**
 * A4 페이지 래퍼. mathlab `A4Page` 컴포넌트의 포팅.
 *
 * **미리보기 + 인쇄 + PDF 캡처가 모두 같은 DOM 을 공유**한다 (key 결정사항).
 * scale prop 으로 미리보기 시 축소만 적용, 실제 페이지 크기 (210mm × 297mm)
 * 는 보존 — pdfExporter 의 `pdf.addImage(..., 210, 297)` 와 정합.
 *
 * outer div: 미리보기 갤러리의 layout 박스. scale 적용 후의 실제 점유 폭/높이.
 * inner div: A4 절대 사이즈 + transform scale — 콘텐츠는 한 번만 paint.
 */
export const A4Page = ({
  scale,
  children,
  paddingClass = "px-12 py-10",
  pageBreak = true,
  bare,
}: A4PageProps) => {
  const padding = bare ? "" : paddingClass;
  return (
    <div
      className="shrink-0 transition-[width,height] duration-150 ease-out"
      style={{
        width: `${A4_WIDTH_PX * scale}px`,
        height: `${A4_HEIGHT_PX * scale}px`,
      }}
    >
      <div
        data-print-page={pageBreak ? "true" : undefined}
        className={`bg-white shadow-lg border border-slate-200 rounded-sm w-[210mm] h-[297mm] ${padding} origin-top-left transition-transform duration-150 ease-out overflow-hidden`}
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
};

interface A4PrintPageProps {
  children: ReactNode;
  /** 마지막 페이지가 아닌 경우 페이지 브레이크 (`@media print`). */
  pageBreak?: boolean;
  paddingClass?: string;
}

/**
 * 인쇄 전용 A4 페이지 래퍼. scale 없음 — 100% 사이즈 그대로 렌더.
 *
 * `printable-root` (Step5Export 의 hidden DOM) 안에서 한 페이지당 하나씩
 * 들어간다. `@media print` 의 `[data-print-page] { page-break-after: always }`
 * 와 조합되어 페이지 분할.
 */
export const A4PrintPage = ({
  children,
  pageBreak = true,
  paddingClass = "px-12 py-10",
}: A4PrintPageProps) => {
  return (
    <div
      data-print-page="true"
      className={`w-full h-[297mm] ${paddingClass}`}
      style={{ pageBreakAfter: pageBreak ? "always" : "auto" }}
    >
      {children}
    </div>
  );
};
