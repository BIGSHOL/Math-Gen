/**
 * 기하 수학 유틸리티 — 순수 계산 함수 (렌더링 의존성 없음).
 *
 * 삼각형의 특수점(내심, 외심, 무게중심, 수심), 내접원/외접원 반지름,
 * 수선의 발, 직선 교점 등 계산.
 *
 * mathlab `lib/utils/svg-diagrams/shared/geometry-math.ts` 1:1 이식.
 */

export interface Pt {
  x: number;
  y: number;
}

export function dist(a: Pt, b: Pt): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

/** 무게중심 (centroid) — 세 꼭짓점의 평균. 세 중선의 교점. 중선을 2:1로 내분. */
export function computeCentroid(a: Pt, b: Pt, c: Pt): Pt {
  return {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
  };
}

/** 내심 (incenter) — 각의 이등분선의 교점. 세 변의 길이로 가중 평균. */
export function computeIncenter(a: Pt, b: Pt, c: Pt): Pt {
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ca = dist(c, a);
  const perimeter = ab + bc + ca;
  if (perimeter === 0) return computeCentroid(a, b, c);
  return {
    x: (bc * a.x + ca * b.x + ab * c.x) / perimeter,
    y: (bc * a.y + ca * b.y + ab * c.y) / perimeter,
  };
}

/** 외심 (circumcenter) — 수직이등분선의 교점. 세 꼭짓점에서 같은 거리인 점. */
export function computeCircumcenter(a: Pt, b: Pt, c: Pt): Pt {
  const ax = a.x, ay = a.y;
  const bx = b.x, by = b.y;
  const cx = c.x, cy = c.y;

  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) return computeCentroid(a, b, c);

  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    D;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    D;

  return { x: ux, y: uy };
}

/** 수심 (orthocenter) — 세 수선의 교점. H = A + B + C - 2O (오일러 관계). */
export function computeOrthocenter(a: Pt, b: Pt, c: Pt): Pt {
  const O = computeCircumcenter(a, b, c);
  return {
    x: a.x + b.x + c.x - 2 * O.x,
    y: a.y + b.y + c.y - 2 * O.y,
  };
}

/** 내접원 반지름 (inradius) — r = S / s. */
export function computeInradius(a: Pt, b: Pt, c: Pt): number {
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ca = dist(c, a);
  const s = (ab + bc + ca) / 2;
  if (s === 0) return 0;
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
  return area / s;
}

/** 외접원 반지름 (circumradius) — R = abc / (4S). */
export function computeCircumradius(a: Pt, b: Pt, c: Pt): number {
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ca = dist(c, a);
  const s = (ab + bc + ca) / 2;
  const area = Math.sqrt(Math.max(0, s * (s - ab) * (s - bc) * (s - ca)));
  if (area === 0) return 0;
  return (ab * bc * ca) / (4 * area);
}

/** 수선의 발 — vertex에서 lineStart-lineEnd 직선에 내린 수선의 발. */
export function footOfPerpendicular(vertex: Pt, lineStart: Pt, lineEnd: Pt): Pt {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { ...lineStart };

  const t = ((vertex.x - lineStart.x) * dx + (vertex.y - lineStart.y) * dy) / lenSq;
  return {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };
}

/** 두 직선의 교점 — 평행이면 null. */
export function lineLineIntersection(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-10) return null;

  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
