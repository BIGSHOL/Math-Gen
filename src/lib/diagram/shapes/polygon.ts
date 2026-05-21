import type { PolygonDiagram, Point } from "../types";
import {
  polygon,
  strokedPolygon,
  renderLabels,
  polygonCentroid,
  outlineCurve,
} from "../primitives";
import * as prim from "../primitives";
import {
  labelOffset,
  edgeLabelOffset,
  pointInPolygon,
  rightAnglePath,
} from "../utils";

/**
 * 임의 N각형 렌더러 (5각형, 6각형, L자, T자, 계단형 등)
 */
export function renderPolygon(spec: PolygonDiagram): string {
  const vertices = spec.vertices ?? [];
  if (vertices.length < 3) {
    return '<text x="0" y="0" font-size="12" fill="#999">잘못된 다각형: 꼭짓점이 3개 미만</text>';
  }

  const {
    labels,
    showLengths,
    regions,
    splitLines,
    rightAngleMarks,
    fill,
    outlineCurve: outlineOpt,
  } = spec;
  const parts: string[] = [];
  const center = polygonCentroid(vertices);

  if (outlineOpt) {
    parts.push(
      outlineCurve(vertices, {
        inflate: outlineOpt.inflate ?? 14,
        color: outlineOpt.color ?? "#999",
        dashArray: outlineOpt.dashArray ?? "4,3",
      }),
    );
  }

  if (regions && regions.length > 0) {
    for (const region of regions) {
      if (!region.vertexIndices || region.vertexIndices.length < 3) continue;
      const regionVerts = region.vertexIndices
        .map((i) => vertices[i])
        .filter((v): v is Point => v !== undefined);
      if (regionVerts.length < 3) continue;
      if (region.fill) {
        parts.push(strokedPolygon(regionVerts, { fill: region.fill, stroke: "none" }));
      }
    }
  } else if (fill) {
    parts.push(strokedPolygon(vertices, { fill, stroke: "none" }));
  }

  parts.push(polygon(vertices));

  if (splitLines) {
    for (const sl of splitLines) {
      if (
        sl.from < 0 ||
        sl.from >= vertices.length ||
        sl.to < 0 ||
        sl.to >= vertices.length
      )
        continue;
      parts.push(
        prim.line(vertices[sl.from], vertices[sl.to], {
          strokeWidth: 1.2,
          dashed: sl.style === "dashed",
          color: sl.color ?? prim.STYLE.MAIN_STROKE,
        }),
      );
    }
  }

  if (regions && regions.length > 0) {
    for (const region of regions) {
      if (!region.label) continue;
      const regionVerts = region.vertexIndices
        .map((i) => vertices[i])
        .filter((v): v is Point => v !== undefined);
      if (regionVerts.length < 3) continue;
      const c = polygonCentroid(regionVerts);
      const ox = region.labelOffset?.[0] ?? 0;
      const oy = region.labelOffset?.[1] ?? 0;
      parts.push(
        prim.text(c[0] + ox, c[1] + oy, region.label, {
          fontSize: 14,
          fontWeight: "bold",
        }),
      );
    }
  }

  if (rightAngleMarks) {
    const n = vertices.length;
    for (const idx of rightAngleMarks) {
      if (idx < 0 || idx >= n) continue;
      const v = vertices[idx];
      const prev = vertices[(idx - 1 + n) % n];
      const next = vertices[(idx + 1) % n];
      const sz = 12;
      const dx1 = prev[0] - v[0],
        dy1 = prev[1] - v[1];
      const dx2 = next[0] - v[0],
        dy2 = next[1] - v[1];
      const l1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
      const l2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
      const probe: Point = [
        v[0] + (dx1 / l1) * sz + (dx2 / l2) * sz,
        v[1] + (dy1 / l1) * sz + (dy2 / l2) * sz,
      ];
      if (pointInPolygon(probe, vertices)) {
        parts.push(prim.path(rightAnglePath(v, prev, next, sz)));
      } else {
        parts.push(prim.path(rightAnglePath(v, next, prev, sz)));
      }
    }
  }

  if (showLengths) {
    for (const { edge, value } of showLengths) {
      const [from, to] = edge;
      if (
        from < 0 ||
        from >= vertices.length ||
        to < 0 ||
        to >= vertices.length
      )
        continue;
      const pos = edgeLabelOffset(vertices[from], vertices[to], vertices, 16);
      parts.push(prim.text(pos[0], pos[1], value, { fontSize: 13 }));
    }
  }

  if (labels && labels.length > 0) {
    parts.push(renderLabels(labels));
  } else if (spec.vertexLabels) {
    const defaultLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    for (let i = 0; i < vertices.length; i++) {
      const labelText = spec.vertexLabels[i] ?? defaultLabels[i] ?? `V${i}`;
      const pos = labelOffset(vertices[i], center, 20);
      parts.push(prim.text(pos[0], pos[1], labelText, { fontWeight: "bold" }));
    }
  }

  return parts.join("\n");
}
