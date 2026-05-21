import type {
  DiagramParams,
  TriangleDiagram,
  CircleDiagram,
  CoordinatePlaneDiagram,
  QuadrilateralDiagram,
  PolygonDiagram,
  SolidFigureDiagram,
  Point,
} from "./types";
import { evaluateExpr } from "./eval-expr";

/**
 * AI 출력 정규화 레이어.
 *
 * AI가 부정확한 좌표를 줘도, 프리셋 기반으로 정확한 좌표를 자동 계산.
 * - preset이 있으면 → sides/angles에서 좌표를 수학적으로 계산
 * - preset이 없고 vertices가 있으면 → 좌표 검증 후 사용
 * - 둘 다 없으면 → 기본값으로 폴백
 */
export function normalizeDiagram(spec: DiagramParams): DiagramParams {
  switch (spec.type) {
    case "triangle":
      return normalizeTriangle(spec);
    case "circle":
      return normalizeCircle(spec);
    case "coordinatePlane":
      return normalizeCoordinatePlane(spec);
    case "quadrilateral":
      return normalizeQuadrilateral(spec);
    case "polygon":
      return normalizePolygon(spec);
    case "solid":
      return normalizeSolid(spec);
    case "composite":
      return {
        ...spec,
        elements: Array.isArray(spec.elements)
          ? spec.elements.map(normalizeDiagram)
          : [],
      };
    default:
      return spec;
  }
}

// ─── 임의 N각형 정규화 ────────────────────────────────────

function normalizePolygon(spec: PolygonDiagram): PolygonDiagram {
  const SCALE = 200;
  const result = { ...spec };
  if (!result.vertices || result.vertices.length < 3) {
    result.vertices = [[0, 100], [100, 100], [100, 40], [50, 0], [0, 40]];
  } else {
    result.vertices = scaleVerticesN(result.vertices, SCALE);
  }
  return result;
}

function scaleVerticesN(vertices: Point[], targetScale: number): Point[] {
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const maxDim = Math.max(width, height);
  if (maxDim < 10 || maxDim > 500) {
    const scale = targetScale / (maxDim || 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return vertices.map((v) => [(v[0] - minX) * scale, (v[1] - minY) * scale]);
  }
  return vertices;
}

// ─── 삼각형 정규화 ────────────────────────────────────

function normalizeTriangle(spec: TriangleDiagram): TriangleDiagram {
  const SCALE = 150;
  const result = { ...spec };

  if (spec.preset) {
    const a = spec.sides?.a ?? 5;
    const b = spec.sides?.b ?? (spec.preset === "equilateral" ? a : 4);
    const c = spec.sides?.c ?? (spec.preset === "equilateral" ? a : 3);

    switch (spec.preset) {
      case "right": {
        const base = c * (SCALE / Math.max(a, b, c));
        const height = b * (SCALE / Math.max(a, b, c));
        result.vertices = [[0, height], [base, height], [0, 0]];
        result.rightAngle = 0;
        break;
      }
      case "right-isosceles": {
        const side = a * (SCALE / a);
        result.vertices = [[0, side], [side, side], [0, 0]];
        result.rightAngle = 0;
        break;
      }
      case "equilateral": {
        const side = a * (SCALE / a);
        const h = (side * Math.sqrt(3)) / 2;
        result.vertices = [[0, h], [side, h], [side / 2, 0]];
        break;
      }
      case "isosceles": {
        const base = c * (SCALE / Math.max(a, c));
        const equal = a * (SCALE / Math.max(a, c));
        const h = Math.sqrt(equal ** 2 - (base / 2) ** 2);
        result.vertices = [[0, h], [base, h], [base / 2, 0]];
        break;
      }
      case "scalene":
      default: {
        const sb = b * (SCALE / Math.max(a, b, c));
        const sc = c * (SCALE / Math.max(a, b, c));
        const sa = a * (SCALE / Math.max(a, b, c));
        const cosA = (sb ** 2 + sc ** 2 - sa ** 2) / (2 * sb * sc);
        const sinA = Math.sqrt(1 - cosA ** 2);
        result.vertices = [
          [0, SCALE],
          [sc, SCALE],
          [sb * cosA, SCALE - sb * sinA],
        ];
        break;
      }
    }

    if (!result.showLengths && spec.sides) {
      result.showLengths = [];
      if (spec.sides.c)
        result.showLengths.push({ edge: [0, 1], value: String(spec.sides.c) });
      if (spec.sides.a)
        result.showLengths.push({ edge: [1, 2], value: String(spec.sides.a) });
      if (spec.sides.b)
        result.showLengths.push({ edge: [2, 0], value: String(spec.sides.b) });
    }

    if (!result.showAngles && spec.angles) {
      result.showAngles = [];
      result.angleValues = [];
      if (spec.angles.A !== undefined) {
        result.showAngles.push(0);
        result.angleValues.push(`${spec.angles.A}°`);
      }
      if (spec.angles.B !== undefined) {
        result.showAngles.push(1);
        result.angleValues.push(`${spec.angles.B}°`);
      }
      if (spec.angles.C !== undefined) {
        result.showAngles.push(2);
        result.angleValues.push(`${spec.angles.C}°`);
      }
    }
  } else if (result.vertices) {
    result.vertices = scaleVertices3(result.vertices, SCALE);
  } else {
    result.vertices = [[0, SCALE], [SCALE, SCALE], [0, 0]];
    result.rightAngle = 0;
  }

  if (spec.specialPoints) result.specialPoints = spec.specialPoints;
  if (spec.auxiliaryLines) result.auxiliaryLines = spec.auxiliaryLines;
  if (spec.inscribedCircle) result.inscribedCircle = spec.inscribedCircle;
  if (spec.circumscribedCircle) result.circumscribedCircle = spec.circumscribedCircle;

  if (!result.labels && spec.vertexLabels) {
    const center: Point = [
      (result.vertices![0][0] + result.vertices![1][0] + result.vertices![2][0]) / 3,
      (result.vertices![0][1] + result.vertices![1][1] + result.vertices![2][1]) / 3,
    ];
    result.labels = spec.vertexLabels.map((text, i) => {
      const v = result.vertices![i];
      const angle = Math.atan2(v[1] - center[1], v[0] - center[0]);
      return {
        text,
        position: [
          v[0] + Math.cos(angle) * 20,
          v[1] + Math.sin(angle) * 20,
        ] as Point,
      };
    });
  }

  return result;
}

// ─── 원 정규화 ────────────────────────────────────

function normalizeCircle(spec: CircleDiagram): CircleDiagram {
  return {
    ...spec,
    center: spec.center ?? [150, 150],
    radius: spec.radius ?? 80,
  };
}

// ─── 좌표평면 정규화 ────────────────────────────────

function normalizeCoordinatePlane(
  spec: CoordinatePlaneDiagram,
): CoordinatePlaneDiagram {
  const result = { ...spec };

  if (spec.functions && spec.functions.length > 0 && (!spec.xRange || !spec.yRange)) {
    const { xRange, yRange } = autoRange(spec.functions.map((f) => f.expr));
    result.xRange = spec.xRange ?? xRange;
    result.yRange = spec.yRange ?? yRange;
  } else {
    result.xRange = spec.xRange ?? [-5, 5];
    result.yRange = spec.yRange ?? [-5, 5];
  }

  if (spec.points) {
    for (const pt of spec.points) {
      const [x, y] = pt.coord;
      if (x < result.xRange[0]) result.xRange = [x - 1, result.xRange[1]];
      if (x > result.xRange[1]) result.xRange = [result.xRange[0], x + 1];
      if (y < result.yRange[0]) result.yRange = [y - 1, result.yRange[1]];
      if (y > result.yRange[1]) result.yRange = [result.yRange[0], y + 1];
    }
  }

  return result;
}

function autoRange(exprs: string[]): {
  xRange: [number, number];
  yRange: [number, number];
} {
  let yMin = Infinity;
  let yMax = -Infinity;

  for (const expr of exprs) {
    for (let x = -10; x <= 10; x += 0.5) {
      const y = evaluateExpr(expr, x);
      if (Number.isFinite(y)) {
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }

  yMin = Math.max(yMin, -20);
  yMax = Math.min(yMax, 20);

  const yPad = Math.max(1, (yMax - yMin) * 0.15);
  return {
    xRange: [-6, 6],
    yRange: [Math.floor(yMin - yPad), Math.ceil(yMax + yPad)],
  };
}

// ─── 사각형 정규화 ────────────────────────────────────

function normalizeQuadrilateral(
  spec: QuadrilateralDiagram,
): QuadrilateralDiagram {
  const SCALE = 150;
  const result = { ...spec };

  if (spec.preset) {
    const w = (spec.sides?.width ?? 6) * (SCALE / 6);
    const h = (spec.sides?.height ?? 4) * (SCALE / 6);

    switch (spec.preset) {
      case "square":
        result.vertices = [[0, w], [w, w], [w, 0], [0, 0]];
        break;
      case "rectangle":
        result.vertices = [[0, h], [w, h], [w, 0], [0, 0]];
        break;
      case "parallelogram": {
        const skew = w * 0.25;
        result.vertices = [[skew, h], [w + skew, h], [w, 0], [0, 0]];
        break;
      }
      case "rhombus": {
        const half = w / 2;
        const halfH = h / 2;
        result.vertices = [[half, h], [w, halfH], [half, 0], [0, halfH]];
        break;
      }
      case "trapezoid": {
        const top = (spec.sides?.top ?? 3) * (SCALE / 6);
        const offset = (w - top) / 2;
        result.vertices = [[0, h], [w, h], [w - offset, 0], [offset, 0]];
        break;
      }
      default:
        result.vertices = [[0, h], [w, h], [w, 0], [0, 0]];
    }

    if (!result.showLengths && spec.sides) {
      result.showLengths = [];
      if (spec.sides.width)
        result.showLengths.push({ edge: [0, 1], value: String(spec.sides.width) });
      if (spec.sides.height)
        result.showLengths.push({ edge: [1, 2], value: String(spec.sides.height) });
    }
  } else if (result.vertices) {
    result.vertices = scaleVertices4(result.vertices, SCALE);
  } else {
    result.vertices = [[0, SCALE], [SCALE, SCALE], [SCALE, 0], [0, 0]];
  }

  if (spec.rightAngleMarks) result.rightAngleMarks = spec.rightAngleMarks;
  if (spec.congruenceMarks) result.congruenceMarks = spec.congruenceMarks;
  if (spec.parallelMarks) result.parallelMarks = spec.parallelMarks;

  // P1 fix (mathlab review.md #8): preset 기반 자동 마커.
  // 사용자가 명시적으로 마커 안 줘도 preset 의미에 맞게 자동 추가.
  // 모든 마커가 *모두 비어있는* 케이스만 — 명시 spec 우선.
  const noManualMarkers =
    !result.rightAngleMarks &&
    !result.congruenceMarks &&
    !result.parallelMarks;
  if (spec.preset && noManualMarkers) {
    switch (spec.preset) {
      case "square":
        result.rightAngleMarks = [0, 1, 2, 3];
        result.congruenceMarks = [
          { from: 0, to: 1, ticks: 1 },
          { from: 1, to: 2, ticks: 1 },
          { from: 2, to: 3, ticks: 1 },
          { from: 3, to: 0, ticks: 1 },
        ];
        break;
      case "rectangle":
        result.rightAngleMarks = [0, 1, 2, 3];
        break;
      case "rhombus":
        result.congruenceMarks = [
          { from: 0, to: 1, ticks: 1 },
          { from: 1, to: 2, ticks: 1 },
          { from: 2, to: 3, ticks: 1 },
          { from: 3, to: 0, ticks: 1 },
        ];
        break;
      case "parallelogram":
        // 두 쌍 평행: top‖bottom, left‖right
        result.parallelMarks = [
          { from: 0, to: 1, arrows: 1 },
          { from: 2, to: 3, arrows: 1 },
          { from: 1, to: 2, arrows: 2 },
          { from: 3, to: 0, arrows: 2 },
        ];
        break;
      case "trapezoid":
        // 한 쌍만 평행 (top‖bottom)
        result.parallelMarks = [
          { from: 0, to: 1, arrows: 1 },
          { from: 2, to: 3, arrows: 1 },
        ];
        break;
    }
  }

  if (!result.labels && spec.vertexLabels) {
    const cx =
      (result.vertices![0][0] +
        result.vertices![1][0] +
        result.vertices![2][0] +
        result.vertices![3][0]) /
      4;
    const cy =
      (result.vertices![0][1] +
        result.vertices![1][1] +
        result.vertices![2][1] +
        result.vertices![3][1]) /
      4;
    const center: Point = [cx, cy];

    result.labels = spec.vertexLabels.map((text, i) => {
      const v = result.vertices![i];
      const angle = Math.atan2(v[1] - center[1], v[0] - center[0]);
      return {
        text,
        position: [
          v[0] + Math.cos(angle) * 20,
          v[1] + Math.sin(angle) * 20,
        ] as Point,
      };
    });
  }

  return result;
}

// ─── 입체도형 정규화 ────────────────────────────────────

/**
 * P1 fix (mathlab review.md #4): dimensions 의 값이 *실제 단위* (cm, m) 일 때
 * 픽셀로 너무 작거나 큼. 다른 shape (triangle, quad, polygon) 의 scaleVertices
 * 패턴 따라 maxDim 을 적정 픽셀 (50-200) 범위로 보정.
 *
 * 모든 dim 키 값을 *동일 비율* 로 스케일 → 도형의 *상대 비율* 보존. 예:
 * \`{size:2, width:10}\` → \`{size:24, width:120}\` (10:2 비율 유지).
 */
function normalizeSolid(spec: SolidFigureDiagram): SolidFigureDiagram {
  const dims = spec.dimensions ?? getDefaultDimensions(spec.shape);
  const TARGET = 120;
  const MIN = 30;
  const MAX = 250;
  const numericEntries = Object.entries(dims).filter(
    ([, v]) => typeof v === "number" && v > 0,
  ) as Array<[string, number]>;
  if (numericEntries.length === 0) {
    return { ...spec, dimensions: dims };
  }
  const maxV = Math.max(...numericEntries.map(([, v]) => v));
  if (maxV >= MIN && maxV <= MAX) {
    return { ...spec, dimensions: dims };
  }
  const scale = TARGET / maxV;
  const scaled: Record<string, number> = {};
  for (const [k, v] of Object.entries(dims)) {
    scaled[k] = typeof v === "number" ? v * scale : (v as number);
  }
  return { ...spec, dimensions: scaled };
}

function getDefaultDimensions(shape: string): Record<string, number> {
  switch (shape) {
    case "cube":
      return { size: 100 };
    case "cylinder":
      return { radius: 60, height: 120 };
    case "cone":
      return { radius: 60, height: 140 };
    case "sphere":
      return { radius: 80 };
    case "prism":
      return { width: 80, height: 100, depth: 60 };
    case "pyramid":
      return { base: 100, height: 120 };
    default:
      return { size: 100 };
  }
}

// ─── 유틸리티 ────────────────────────────────────

function scaleVertices3(
  vertices: [Point, Point, Point],
  targetScale: number,
): [Point, Point, Point] {
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const maxDim = Math.max(width, height);

  if (maxDim < 10 || maxDim > 500) {
    const scale = targetScale / (maxDim || 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return vertices.map((v) => [
      (v[0] - minX) * scale,
      (v[1] - minY) * scale,
    ]) as [Point, Point, Point];
  }

  return vertices;
}

function scaleVertices4(
  vertices: [Point, Point, Point, Point],
  targetScale: number,
): [Point, Point, Point, Point] {
  const xs = vertices.map((v) => v[0]);
  const ys = vertices.map((v) => v[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const maxDim = Math.max(width, height);

  if (maxDim < 10 || maxDim > 500) {
    const scale = targetScale / (maxDim || 1);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return vertices.map((v) => [
      (v[0] - minX) * scale,
      (v[1] - minY) * scale,
    ]) as [Point, Point, Point, Point];
  }

  return vertices;
}
