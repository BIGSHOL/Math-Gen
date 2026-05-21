import type { DiagramParams, Point } from "./types";
import { computeViewBox } from "./utils";
import { normalizeDiagram } from "./normalize";
import { renderTriangle } from "./shapes/triangle";
import { renderCircle } from "./shapes/circle";
import { renderQuadrilateral } from "./shapes/quadrilateral";
import { renderPolygon } from "./shapes/polygon";
import { renderCoordinatePlane, coordinatePlaneViewBox } from "./shapes/coordinate";
import { renderSolid, solidViewBox } from "./shapes/solid";

/**
 * DiagramParams → 완성된 SVG 문자열 변환.
 *
 * 1. normalize: AI 출력 검증/보정 (프리셋→좌표, 스케일 조정, 범위 자동)
 * 2. render: 정규화된 spec → 정확한 SVG
 *
 * 출력: `<svg xmlns="..." viewBox="..." style="max-width:100%;height:auto;">`.
 * mathg-gen 의 MarkdownRenderer Stage 0 (CLAUDE.md 2-1) 이 dangerouslySetInnerHTML
 * 로 자동 주입 — namespace 함정 회피.
 */
export function renderDiagram(rawSpec: DiagramParams): string {
  const spec = normalizeDiagram(rawSpec);
  const viewBox = getViewBox(spec);
  const content = renderShape(spec);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" style="max-width:100%;height:auto;">`,
    content,
    "</svg>",
  ].join("\n");
}

function renderShape(spec: DiagramParams): string {
  switch (spec.type) {
    case "triangle":
      return renderTriangle(spec);
    case "circle":
      return renderCircle(spec);
    case "quadrilateral":
      return renderQuadrilateral(spec);
    case "polygon":
      return renderPolygon(spec);
    case "coordinatePlane":
      return renderCoordinatePlane(spec);
    case "solid":
      return renderSolid(spec);
    case "composite":
      return spec.elements.map((el) => renderShape(el)).join("\n");
    default:
      return "";
  }
}

function getViewBox(spec: DiagramParams): string {
  switch (spec.type) {
    case "triangle":
      return computeViewBox(spec.vertices ?? [[0, 0], [150, 0], [0, 150]]);
    case "circle": {
      const cx = spec.center?.[0] ?? 150;
      const cy = spec.center?.[1] ?? 150;
      const r = spec.radius ?? 80;
      const points: Point[] = [
        [cx - r, cy - r],
        [cx + r, cy + r],
      ];
      return computeViewBox(points, 50);
    }
    case "quadrilateral":
      return computeViewBox(
        spec.vertices ?? [[0, 0], [150, 0], [150, 150], [0, 150]],
      );
    case "polygon":
      return computeViewBox(spec.vertices ?? [[0, 0], [100, 0], [50, 100]]);
    case "coordinatePlane":
      return coordinatePlaneViewBox(spec);
    case "solid":
      return solidViewBox(spec);
    case "composite": {
      const allPoints = collectPoints(spec);
      return allPoints.length > 0 ? computeViewBox(allPoints, 50) : "0 0 400 300";
    }
    default:
      return "0 0 400 300";
  }
}

function collectPoints(spec: DiagramParams): Point[] {
  switch (spec.type) {
    case "triangle":
      return [...(spec.vertices ?? [[0, 0], [150, 0], [0, 150]])];
    case "circle": {
      const cx = spec.center?.[0] ?? 150;
      const cy = spec.center?.[1] ?? 150;
      const r = spec.radius ?? 80;
      return [
        [cx - r, cy - r],
        [cx + r, cy + r],
      ];
    }
    case "quadrilateral":
      return [...(spec.vertices ?? [[0, 0], [150, 0], [150, 150], [0, 150]])];
    case "polygon":
      return [...(spec.vertices ?? [[0, 0], [100, 0], [50, 100]])];
    case "coordinatePlane":
      return [
        [0, 0],
        [400, 360],
      ];
    case "solid":
      return [
        [0, 0],
        [300, 280],
      ];
    case "composite":
      return spec.elements.flatMap(collectPoints);
    default:
      return [];
  }
}
