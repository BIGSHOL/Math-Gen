// figureBoxRemap.ts — Pass-2 cropped OCR 의 *크롭-로컬* box 를 full-page 좌표로 역변환.
//
// Pass 2 는 페이지의 한 문항 영역(cropBox.bbox)만 잘라(cropPageImageData) 재OCR 한다.
// 그 결과의 images[].box / figures[].box 는 *크롭 이미지 로컬* 0–1000 좌표라 full-page
// 기준 위치 배치(figureLayout)와 어긋난다. 크롭 시 적용한 margin 까지 포함해 역변환.
//
// cropPageImageData 는 bbox 에 *대칭* margin(기본 4%, Pass2 는 2%)을 적용하므로 동일
// margin 으로 확장된 크롭 영역을 기준 삼아 로컬→full-page 매핑한다.

export type Box4 = [number, number, number, number]; // [yMin, xMin, yMax, xMax] 0–1000

const clamp01000 = (n: number): number => Math.max(0, Math.min(1000, n));

/**
 * @param local    크롭 이미지 로컬 box (0–1000)
 * @param cropBbox 크롭 영역의 full-page box (0–1000) — cropDetect/Step1.5 의 bbox
 * @param margin   cropPageImageData 에 넘긴 margin (예: 0.02) — 반드시 일치해야 함
 */
export const remapBoxToFullPage = (
  local: Box4,
  cropBbox: Box4,
  margin: number,
): Box4 => {
  const [cY1, cX1, cY2, cX2] = cropBbox;
  const mw = (cX2 - cX1) * margin;
  const mh = (cY2 - cY1) * margin;
  const x1 = Math.max(0, cX1 - mw);
  const y1 = Math.max(0, cY1 - mh);
  const x2 = Math.min(1000, cX2 + mw);
  const y2 = Math.min(1000, cY2 + mh);
  const cw = x2 - x1 || 1;
  const ch = y2 - y1 || 1;
  const [lY1, lX1, lY2, lX2] = local;
  return [
    clamp01000(y1 + (lY1 / 1000) * ch),
    clamp01000(x1 + (lX1 / 1000) * cw),
    clamp01000(y1 + (lY2 / 1000) * ch),
    clamp01000(x1 + (lX2 / 1000) * cw),
  ];
};
