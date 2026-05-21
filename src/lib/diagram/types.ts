/**
 * Diagram type schema — mathlab 1:1 이식 (union 이름만 `DiagramSpec` → `DiagramParams`).
 *
 * 단일 type 시스템: AI raw output 과 정규화된 spec 이 *같은 type*. `preset` 유무로
 * 런타임 구분 (raw 는 preset 있음, normalize 후엔 vertices 채움).
 */

/** 기본 좌표 타입 */
export type Point = [number, number];

/** 라벨 정보 */
export interface DiagramLabel {
  text: string;
  position: Point;
  fontSize?: number;
}

/** 선분 길이 표시 */
export interface EdgeLength {
  /** 두 꼭짓점의 인덱스 [from, to] */
  edge: [number, number];
  value: string;
}

// ─── 삼각형 프리셋 ────────────────────────────────────
// AI는 좌표 대신 preset + sides/angles만 지정하면 렌더러가 좌표를 자동 계산

export type TrianglePreset =
  | "right" // 직각삼각형
  | "equilateral" // 정삼각형
  | "isosceles" // 이등변삼각형
  | "scalene" // 부등변삼각형
  | "right-isosceles"; // 직각이등변삼각형

// ─── 사각형 프리셋 ────────────────────────────────────
export type QuadrilateralPreset =
  | "square" // 정사각형
  | "rectangle" // 직사각형
  | "parallelogram" // 평행사변형
  | "rhombus" // 마름모
  | "trapezoid" // 사다리꼴
  | "general"; // 일반 사각형

// ─── 도형 유형 ────────────────────────────────────────

export interface TriangleDiagram {
  type: "triangle";
  /** 프리셋 사용 시 좌표 자동 계산 (AI가 좌표를 몰라도 됨) */
  preset?: TrianglePreset;
  /** 프리셋 사용 시: 변의 길이 (예: { a: 3, b: 4, c: 5 }) */
  sides?: { a?: number; b?: number; c?: number };
  /** 프리셋 사용 시: 각도 (도 단위, 예: { A: 90, B: 60, C: 30 }) */
  angles?: { A?: number; B?: number; C?: number };
  /** 꼭짓점 이름 (기본: ["A", "B", "C"]) */
  vertexLabels?: [string, string, string];
  /** 직접 좌표 지정 (프리셋 없을 때만 사용) */
  vertices?: [Point, Point, Point];
  labels?: DiagramLabel[];
  /** 각도를 표시할 꼭짓점 인덱스 */
  showAngles?: number[];
  /** 각도 값 (인덱스 순서대로) */
  angleValues?: string[];
  showLengths?: EdgeLength[];
  /** 직각 표시할 꼭짓점 인덱스 */
  rightAngle?: number;
  /** 특수점 표시 (내심, 외심, 무게중심, 수심) */
  specialPoints?: ("incenter" | "circumcenter" | "centroid" | "orthocenter")[];
  /** 보조선 표시 (중선, 수선, 각의 이등분선, 수직이등분선) */
  auxiliaryLines?: (
    | "medians"
    | "altitudes"
    | "angle_bisectors"
    | "perpendicular_bisectors"
  )[];
  /** 내접원 표시 */
  inscribedCircle?: boolean;
  /** 외접원 표시 */
  circumscribedCircle?: boolean;
  /** 외각 표시: 꼭짓점에서 변을 연장하여 외각 호와 값을 표시 */
  exteriorAngles?: {
    /** 꼭짓점 인덱스 (0=A, 1=B, 2=C) */
    vertex: number;
    /** 연장할 변의 반대쪽 꼭짓점 인덱스 (이 변을 꼭짓점 너머로 연장) */
    extendFrom: number;
    /** 외각 값 표시 (예: "130°") */
    value?: string;
    /** 연장선 길이 (기본 50) */
    extensionLength?: number;
  }[];
  /** 도형 채우기 색 (기본 none) */
  fill?: string;
  /** 도형 외곽을 따라가는 점선 곡선 (교과서 풍 데코) */
  outlineCurve?: OutlineCurveOptions;
}

export interface CircleDiagram {
  type: "circle";
  center?: Point;
  radius?: number;
  showRadius?: boolean;
  showDiameter?: boolean;
  /** 현(chord): 원 위 두 점의 각도(degree) */
  chords?: { from: number; to: number; label?: string }[];
  /** 접선: 접점의 각도(degree) */
  tangentLines?: { angle: number; length?: number; label?: string }[];
  /** 호: 시작/끝 각도(degree) */
  arcs?: { from: number; to: number; label?: string }[];
  /** 내접/외접 삼각형 등 */
  inscribedPolygon?: { sides: number; rotation?: number; labels?: string[] };
  /** 반지름선: 중심→원주 */
  radiusLines?: { angle: number; label?: string }[];
  /** 중심각: 반지름 2개 + 호 + 섹터 채움 */
  centralAngles?: { startAngle: number; endAngle: number; label?: string }[];
  /** 원주각: 원주 한 점에서 호 양 끝으로 두 현 */
  inscribedAngles?: {
    vertexAngle: number;
    startAngle: number;
    endAngle: number;
    label?: string;
  }[];
  labels?: DiagramLabel[];
}

export interface CoordinatePlaneDiagram {
  type: "coordinatePlane";
  xRange?: [number, number];
  yRange?: [number, number];
  showGrid?: boolean;
  /** 함수 그래프 - 수식 문자열만 주면 범위/좌표 자동 계산 */
  functions?: {
    expr: string;
    color?: string;
    domain?: [number, number];
    label?: string;
  }[];
  /** 점 표시 */
  points?: { coord: Point; label?: string; color?: string }[];
  /** 직선/선분 */
  lines?: { from: Point; to: Point; dashed?: boolean; label?: string }[];
  /** 영역 색칠 */
  regions?: { points: Point[]; color?: string; opacity?: number }[];
  labels?: DiagramLabel[];
}

export interface QuadrilateralDiagram {
  type: "quadrilateral";
  /** 프리셋 사용 시 좌표 자동 계산 */
  preset?: QuadrilateralPreset;
  /** 프리셋 사용 시: 변의 길이 */
  sides?: { width?: number; height?: number; top?: number };
  /** 꼭짓점 이름 (기본: ["A", "B", "C", "D"]) */
  vertexLabels?: [string, string, string, string];
  /** 직접 좌표 지정 (프리셋 없을 때만 사용) */
  vertices?: [Point, Point, Point, Point];
  labels?: DiagramLabel[];
  showAngles?: number[];
  angleValues?: string[];
  showLengths?: EdgeLength[];
  /** 대각선 표시 (boolean 또는 개별 지정) */
  diagonals?:
    | boolean
    | { from: number; to: number; label?: string; style?: "solid" | "dashed" }[];
  /** 직각 표시할 꼭짓점 인덱스 */
  rightAngleMarks?: number[];
  /** 합동 표시 (변 위 빗금) */
  congruenceMarks?: { from: number; to: number; ticks: number }[];
  /** 평행 표시 (변 위 화살표) */
  parallelMarks?: { from: number; to: number; arrows: number }[];
  /** 도형 채우기 색 (예: "#D6F0E0", 기본 none) */
  fill?: string;
  /** 대각선 분할 — 두 삼각형을 다른 색으로 자동 채움 + 영역 라벨 (① ② 등) */
  splitDiagonal?: {
    from: number;
    to: number;
    fillA?: string;
    fillB?: string;
    labelA?: string;
    labelB?: string;
    style?: "solid" | "dashed";
  };
  /** 도형 외곽을 따라가는 점선 곡선 (교과서 풍 데코) */
  outlineCurve?: OutlineCurveOptions;
}

/** 도형 외곽을 부드러운 점선 곡선으로 감싸는 옵션 (교과서 스타일 데코) */
export interface OutlineCurveOptions {
  /** 곡선 스타일 — 'arc'는 원호 근사, 'bezier'는 베지어 (기본 bezier) */
  style?: "arc" | "bezier";
  /** 외곽으로 부풀리는 정도 (px, 기본 12) */
  inflate?: number;
  /** 선 색 (기본 #999) */
  color?: string;
  /** 점선 dash 패턴 (기본 "4,3") */
  dashArray?: string;
}

/** 임의 N각형 (5각형, 6각형, L자, T자, 계단형 등) */
export interface PolygonDiagram {
  type: "polygon";
  /** 꼭짓점 좌표 배열 (3개 이상, 시계방향 또는 반시계방향) */
  vertices: Point[];
  /** 꼭짓점 이름 (기본 A, B, C, ... 자동 생성) */
  vertexLabels?: string[];
  /** 임의 위치 라벨 */
  labels?: DiagramLabel[];
  /** 변의 길이 표시 (자동 위치 — 변 중앙에 외측 offset) */
  showLengths?: EdgeLength[];
  /** 직각 표시할 꼭짓점 인덱스 배열 */
  rightAngleMarks?: number[];
  /** 도형 전체 채움 색 (regions 미사용 시) */
  fill?: string;
  /** 영역 분할 — 분할선이 만드는 부분 영역을 다른 색으로 채우고 라벨 표시 */
  regions?: Array<{
    /** 이 영역을 구성하는 꼭짓점 인덱스 (다각형 내부에서) */
    vertexIndices: number[];
    fill?: string;
    label?: string;
    labelOffset?: Point;
  }>;
  /** 분할선 — 도형 내부에 그릴 보조선 (꼭짓점 → 꼭짓점) */
  splitLines?: Array<{
    from: number;
    to: number;
    style?: "solid" | "dashed";
    color?: string;
  }>;
  /** 도형 외곽을 따라가는 점선 곡선 (교과서 풍 데코) */
  outlineCurve?: OutlineCurveOptions;
}

export interface SolidFigureDiagram {
  type: "solid";
  shape: "cube" | "cylinder" | "cone" | "sphere" | "prism" | "pyramid";
  dimensions?: Record<string, number>;
  labels?: DiagramLabel[];
  showDimensions?: boolean;
}

export interface CompositeDiagram {
  type: "composite";
  elements: DiagramParams[];
  /** 전체 viewBox 오프셋 */
  offset?: Point;
}

/**
 * 지원하는 모든 도형 유형의 유니온. mathlab 의 `DiagramSpec` 과 동일하나
 * 우리 코드에서는 단일 이름 `DiagramParams` 만 사용.
 */
export type DiagramParams =
  | TriangleDiagram
  | CircleDiagram
  | CoordinatePlaneDiagram
  | QuadrilateralDiagram
  | PolygonDiagram
  | SolidFigureDiagram
  | CompositeDiagram;
