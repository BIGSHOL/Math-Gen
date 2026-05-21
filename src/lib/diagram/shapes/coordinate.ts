import type { CoordinatePlaneDiagram, Point } from "../types";
import * as prim from "../primitives";
import { STYLE } from "../primitives";
import { evaluateExpr } from "../eval-expr";

/** 좌표평면 + 함수 그래프 렌더러 */
export function renderCoordinatePlane(spec: CoordinatePlaneDiagram): string {
  const { xRange, yRange, showGrid, functions, points, lines, regions, labels } = spec;
  const parts: string[] = [];

  const padding = 40;
  const plotW = 320;
  const plotH = 280;

  const xMin = xRange?.[0] ?? -5;
  const xMax = xRange?.[1] ?? 5;
  const yMin = yRange?.[0] ?? -5;
  const yMax = yRange?.[1] ?? 5;

  const scaleX = plotW / (xMax - xMin);
  const scaleY = plotH / (yMax - yMin);

  const toSvg = (p: Point): Point => [
    padding + (p[0] - xMin) * scaleX,
    padding + (yMax - p[1]) * scaleY,
  ];

  const origin = toSvg([0, 0]);

  if (showGrid) {
    for (let x = Math.ceil(xMin); x <= xMax; x++) {
      if (x === 0) continue;
      const sx = padding + (x - xMin) * scaleX;
      parts.push(
        `<line x1="${sx}" y1="${padding}" x2="${sx}" y2="${padding + plotH}" stroke="${STYLE.GRID_COLOR}" stroke-width="0.5"/>`,
      );
    }
    for (let y = Math.ceil(yMin); y <= yMax; y++) {
      if (y === 0) continue;
      const sy = padding + (yMax - y) * scaleY;
      parts.push(
        `<line x1="${padding}" y1="${sy}" x2="${padding + plotW}" y2="${sy}" stroke="${STYLE.GRID_COLOR}" stroke-width="0.5"/>`,
      );
    }
  }

  const xAxisY = clamp(origin[1], padding, padding + plotH);
  const yAxisX = clamp(origin[0], padding, padding + plotW);

  parts.push(
    `<line x1="${padding}" y1="${xAxisY}" x2="${padding + plotW}" y2="${xAxisY}" stroke="${STYLE.AXIS_COLOR}" stroke-width="${STYLE.MAIN_STROKE_WIDTH}"/>`,
  );
  parts.push(
    `<line x1="${yAxisX}" y1="${padding}" x2="${yAxisX}" y2="${padding + plotH}" stroke="${STYLE.AXIS_COLOR}" stroke-width="${STYLE.MAIN_STROKE_WIDTH}"/>`,
  );

  parts.push(arrowHead(padding + plotW, xAxisY, "right"));
  parts.push(arrowHead(yAxisX, padding, "up"));

  parts.push(prim.text(padding + plotW + 14, xAxisY, "x", { fontSize: 14 }));
  parts.push(prim.text(yAxisX, padding - 14, "y", { fontSize: 14 }));

  for (let x = Math.ceil(xMin); x <= xMax; x++) {
    if (x === 0) continue;
    const sx = padding + (x - xMin) * scaleX;
    parts.push(
      `<line x1="${sx}" y1="${xAxisY - 3}" x2="${sx}" y2="${xAxisY + 3}" stroke="${STYLE.AXIS_COLOR}" stroke-width="1"/>`,
    );
    parts.push(prim.text(sx, xAxisY + 14, String(x), { fontSize: 11 }));
  }
  for (let y = Math.ceil(yMin); y <= yMax; y++) {
    if (y === 0) continue;
    const sy = padding + (yMax - y) * scaleY;
    parts.push(
      `<line x1="${yAxisX - 3}" y1="${sy}" x2="${yAxisX + 3}" y2="${sy}" stroke="${STYLE.AXIS_COLOR}" stroke-width="1"/>`,
    );
    parts.push(prim.text(yAxisX - 14, sy, String(y), { fontSize: 11 }));
  }

  if (xMin <= 0 && xMax >= 0 && yMin <= 0 && yMax >= 0) {
    parts.push(
      prim.text(yAxisX - 12, xAxisY + 14, "O", { fontSize: 12, fontWeight: "bold" }),
    );
  }

  if (regions) {
    for (const region of regions) {
      const svgPts = region.points.map(toSvg);
      parts.push(prim.filledRegion(svgPts, region.color, region.opacity));
    }
  }

  if (functions) {
    for (const fn of functions) {
      const color = fn.color ?? "#2563eb";
      const domainMin = fn.domain?.[0] ?? xMin;
      const domainMax = fn.domain?.[1] ?? xMax;
      const step = (domainMax - domainMin) / 200;
      const pathPoints: Point[] = [];

      for (let x = domainMin; x <= domainMax; x += step) {
        const y = evaluateExpr(fn.expr, x);
        if (!Number.isFinite(y)) continue;
        if (y < yMin - 5 || y > yMax + 5) continue;
        pathPoints.push(toSvg([x, y]));
      }

      if (pathPoints.length > 1) {
        const d =
          `M ${pathPoints[0][0]} ${pathPoints[0][1]} ` +
          pathPoints
            .slice(1)
            .map(([px, py]) => `L ${px} ${py}`)
            .join(" ");
        parts.push(prim.path(d, { strokeWidth: 2, color }));
      }

      if (fn.label) {
        const lastPt = pathPoints[pathPoints.length - 1];
        if (lastPt) {
          parts.push(
            prim.text(lastPt[0] + 10, lastPt[1] - 8, fn.label, { fontSize: 12 }),
          );
        }
      }
    }
  }

  if (lines) {
    for (const ln of lines) {
      const from = toSvg(ln.from);
      const to = toSvg(ln.to);
      parts.push(prim.line(from, to, { dashed: ln.dashed, strokeWidth: 1.5 }));
      if (ln.label) {
        const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        parts.push(prim.text(mid[0] + 8, mid[1] - 8, ln.label, { fontSize: 12 }));
      }
    }
  }

  if (points) {
    for (const pt of points) {
      const svgPt = toSvg(pt.coord);
      parts.push(prim.dot(svgPt[0], svgPt[1], 4, pt.color));
      if (pt.label) {
        parts.push(
          prim.text(svgPt[0] + 10, svgPt[1] - 10, pt.label, { fontSize: 12 }),
        );
      }
    }
  }

  if (labels && labels.length > 0) {
    const svgLabels = labels.map((l) => ({
      ...l,
      position: toSvg(l.position),
    }));
    parts.push(prim.renderLabels(svgLabels));
  }

  return parts.join("\n");
}

export function coordinatePlaneViewBox(_spec: CoordinatePlaneDiagram): string {
  return `0 0 ${320 + 80} ${280 + 80}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function arrowHead(x: number, y: number, dir: "right" | "up"): string {
  if (dir === "right") {
    return `<polygon points="${x},${y} ${x - 8},${y - 4} ${x - 8},${y + 4}" fill="${STYLE.AXIS_COLOR}"/>`;
  }
  return `<polygon points="${x},${y} ${x - 4},${y + 8} ${x + 4},${y + 8}" fill="${STYLE.AXIS_COLOR}"/>`;
}
