import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A4 사이즈 (mm → px, 1mm ≈ 3.7795275591 px @ 96dpi).
 *
 * 한국 학교 시험지 표준이며 mathlab `usePreviewScale.ts` 와 *동일 상수*. PDF
 * 출력 (`src/lib/pdfExporter.ts`) 의 `pdf.addImage(..., 210, 297)` 단위와도
 * 정합 (jsPDF unit: "mm").
 */
export const A4_WIDTH_PX = 210 * 3.7795275591; // 793.7
export const A4_HEIGHT_PX = 297 * 3.7795275591; // 1122.5

/**
 * Step 5 미리보기 갤러리의 *스케일 hook*. mathlab 의 동일 hook 을 거의 그대로
 * 차용 (Next.js `'use client'` 만 제거).
 *
 * 특징:
 *   - `fitToContainer()` — 컨테이너 높이에 맞춰 자동 scale 계산 (0.45 ~ 1.0)
 *   - 슬라이더 변경 시 *75% / 100% 자석 효과* — UX 일관성
 *   - `galleryRef` ResizeObserver-free 패턴 (window.resize 만 청취) — Step5
 *     의 left/right panel 토글 시 즉시 fit 호출
 */
export function usePreviewScale() {
  const [scale, setScale] = useState(1.0);
  const galleryRef = useRef<HTMLDivElement>(null);

  const scalePercent = Math.round(scale * 100);

  // 1. 컨테이너 크기에 맞춰 자동 조절
  const fitToContainer = useCallback(() => {
    const el = galleryRef.current;
    if (!el) return;

    const containerH = el.clientHeight;
    const padding = 32;
    const calculatedScale = Math.min((containerH - padding) / A4_HEIGHT_PX, 1.0);

    // 0.45 ~ 1.0 사이로 조정
    setScale(Math.max(0.45, calculatedScale));
  }, []);

  // 2. 초기 로드 및 리사이즈 대응
  useEffect(() => {
    fitToContainer();
    window.addEventListener("resize", fitToContainer);
    return () => window.removeEventListener("resize", fitToContainer);
  }, [fitToContainer]);

  // 3. 직접 스케일 설정 (Snapping 포함)
  const setScaleWithSnapping = useCallback((value: number) => {
    let v = value;
    // 75% 나 100% 근처에서 자석 효과
    if (v >= 0.73 && v <= 0.77) v = 0.75;
    else if (v >= 0.98 && v <= 1.02) v = 1.0;
    setScale(v);
  }, []);

  // 4. 슬라이더용 핸들러 (퍼센트 입력)
  const setScaleFromSlider = useCallback(
    (value: number) => {
      setScaleWithSnapping(value / 100);
    },
    [setScaleWithSnapping],
  );

  return {
    scale,
    setScale: setScaleWithSnapping,
    scalePercent,
    galleryRef,
    fitToContainer,
    setScaleFromSlider,
  };
}
