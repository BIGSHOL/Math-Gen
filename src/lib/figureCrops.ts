import type { CropBox, FigureCrop } from "../stores/wizardStore.js";
import { remapBoxToFullPage, type Box4 } from "./figureBoxRemap.js";

/** 검수/최초 OCR/문항 재인식의 크롭 좌표계는 같은 여백을 사용한다. */
export const QUESTION_CROP_MARGIN = 0.02;

export function intersectFigureBox(box: Box4, parent: Box4): Box4 | null {
  const next: Box4 = [Math.max(box[0], parent[0]), Math.max(box[1], parent[1]),
    Math.min(box[2], parent[2]), Math.min(box[3], parent[3])];
  return next[2] > next[0] && next[3] > next[1] ? next : null;
}

export function fitFigureCrops(figures: FigureCrop[], parent: Box4): FigureCrop[] {
  return figures.flatMap(figure => {
    const bbox = intersectFigureBox(figure.bbox, parent);
    return bbox ? [{ ...figure, bbox }] : [];
  });
}

/** 검수에서 확정한 페이지 좌표를 실제 문제 크롭 좌표로 역변환한다. */
export function figuresForQuestionCrop(box: CropBox) {
  if (box.figureCrops === undefined) return undefined;
  const [y1, x1, y2, x2] = remapBoxToFullPage([0, 0, 1000, 1000], box.bbox, QUESTION_CROP_MARGIN);
  return fitFigureCrops(box.figureCrops, box.bbox).map(figure => ({
    box: [
      (figure.bbox[0] - y1) / (y2 - y1) * 1000,
      (figure.bbox[1] - x1) / (x2 - x1) * 1000,
      (figure.bbox[2] - y1) / (y2 - y1) * 1000,
      (figure.bbox[3] - x1) / (x2 - x1) * 1000,
    ] as Box4,
    label: figure.label,
    kind: figure.kind,
  }));
}

export const figureDetectionReady = (box: CropBox) =>
  box.class !== "problem" || box.figureCrops !== undefined || !!box.figureDetectError;
