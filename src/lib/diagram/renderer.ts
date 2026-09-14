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
/**
 * 좌표 자리에 한 겹 더 감싸진 배열(`[[x, y]]`)이 오면 평탄화한다.
 *
 * AI 가 `vertices: [[[105,165]], ...]` 처럼 emit 하면 `prim.line(vertices[i], ...)`
 * 이 Point 대신 Point[] 를 받아 `x1="105,165" y1="undefined"` 같은 깨진 속성이
 * 그대로 SVG 에 박힌다 (브라우저 콘솔: `<line> attribute x1: Expected length`).
 * renderDiagram 이 유일한 진입점이므로 여기서 한 번만 보정하면 모든 호출부
 * (OCRItem / VariantItem / ProblemBody / DetailScreen / hwpFigures) 가 보호된다.
 */
const asPoint = (value: unknown): Point | null => {
  if (!Array.isArray(value)) return null;
  const [x, y] = value;
  if (typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y)) {
    return [x, y];
  }
  // `[[x, y]]` — 한 겹 더 감싸진 경우만 재귀. `[x, y]` 가 아니면 null.
  return value.length === 1 ? asPoint(x) : null;
};

/** 좌표 하나를 담는 필드. `from`/`to` 는 number 인덱스일 수도 있어 배열일 때만 보정. */
const POINT_KEYS = new Set(["center", "position", "coord", "labelOffset", "offset", "from", "to"]);
/** 좌표 배열을 담는 필드. */
const POINT_LIST_KEYS = new Set(["vertices", "points"]);

const sanitizeCoords = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(sanitizeCoords);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (POINT_KEYS.has(key) && Array.isArray(value)) {
      out[key] = asPoint(value) ?? sanitizeCoords(value);
    } else if (POINT_LIST_KEYS.has(key) && Array.isArray(value)) {
      out[key] = value.map((entry) => asPoint(entry) ?? sanitizeCoords(entry));
    } else {
      out[key] = sanitizeCoords(value);
    }
  }
  return out;
};

export function renderDiagram(rawSpec: DiagramParams): string {
  const spec = normalizeDiagram(sanitizeCoords(rawSpec) as DiagramParams);
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
      return computeViewBox(points, 30);
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
      return allPoints.length > 0 ? computeViewBox(allPoints, 30) : "0 0 400 300";
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
