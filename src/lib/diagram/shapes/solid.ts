import type { SolidFigureDiagram } from "../types";
import * as prim from "../primitives";

/** 입체도형 2D 투영 렌더러 */
export function renderSolid(spec: SolidFigureDiagram): string {
  const { shape, labels, showDimensions } = spec;
  const dimensions = spec.dimensions ?? { size: 100 };

  switch (shape) {
    case "cube":
      return renderCube(dimensions, showDimensions, labels);
    case "cylinder":
      return renderCylinder(dimensions, showDimensions, labels);
    case "cone":
      return renderCone(dimensions, showDimensions, labels);
    case "sphere":
      return renderSphere(dimensions, showDimensions, labels);
    case "prism":
      return renderPrism(dimensions, showDimensions, labels);
    case "pyramid":
      return renderPyramid(dimensions, showDimensions, labels);
    default:
      return "";
  }
}

export function solidViewBox(_spec: SolidFigureDiagram): string {
  return "0 0 300 280";
}

function renderCube(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const s = dim.size ?? dim.width ?? 100;
  const offset = s * 0.35;
  const parts: string[] = [];
  const cx = 150;
  const cy = 150;

  const front = [
    [cx - s / 2, cy + s / 2],
    [cx + s / 2, cy + s / 2],
    [cx + s / 2, cy - s / 2],
    [cx - s / 2, cy - s / 2],
  ] as [number, number][];

  const back = front.map(([x, y]) => [x + offset, y - offset] as [number, number]);

  parts.push(prim.polygon(front));

  parts.push(prim.line(back[0], back[3], { dashed: true, strokeWidth: 1 }));
  parts.push(prim.line(back[0], back[1], { dashed: true, strokeWidth: 1 }));
  parts.push(prim.line(back[0], front[0], { dashed: true, strokeWidth: 1 }));

  parts.push(prim.line(back[1], back[2]));
  parts.push(prim.line(back[2], back[3]));
  parts.push(prim.line(back[3], front[3]));
  parts.push(prim.line(back[2], front[2]));
  parts.push(prim.line(back[1], front[1]));

  if (showDim) {
    parts.push(prim.text(cx, cy + s / 2 + 20, `${s}`, { fontSize: 13 }));
  }

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}

function renderCylinder(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const r = dim.radius ?? 60;
  const h = dim.height ?? 120;
  const cx = 150;
  const topY = 80;
  const bottomY = topY + h;
  const ry = r * 0.3;
  const parts: string[] = [];

  parts.push(
    `<ellipse cx="${cx}" cy="${topY}" rx="${r}" ry="${ry}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="2"/>`,
  );

  parts.push(prim.line([cx - r, topY], [cx - r, bottomY]));
  parts.push(prim.line([cx + r, topY], [cx + r, bottomY]));

  parts.push(
    `<path d="M ${cx - r} ${bottomY} A ${r} ${ry} 0 0 0 ${cx + r} ${bottomY}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="2"/>`,
  );
  parts.push(
    `<path d="M ${cx - r} ${bottomY} A ${r} ${ry} 0 0 1 ${cx + r} ${bottomY}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="1" stroke-dasharray="6,4"/>`,
  );

  if (showDim) {
    parts.push(
      prim.line([cx + r + 15, topY], [cx + r + 15, bottomY], { strokeWidth: 1 }),
    );
    parts.push(prim.text(cx + r + 28, (topY + bottomY) / 2, `${h}`, { fontSize: 12 }));
    parts.push(prim.line([cx, topY], [cx + r, topY], { strokeWidth: 1, dashed: true }));
    parts.push(prim.text(cx + r / 2, topY - 12, `${r}`, { fontSize: 12 }));
  }

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}

function renderCone(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const r = dim.radius ?? 60;
  const h = dim.height ?? 140;
  const cx = 150;
  const topY = 60;
  const bottomY = topY + h;
  const ry = r * 0.3;
  const parts: string[] = [];

  parts.push(prim.dot(cx, topY, 3));

  parts.push(prim.line([cx, topY], [cx - r, bottomY]));
  parts.push(prim.line([cx, topY], [cx + r, bottomY]));

  parts.push(
    `<path d="M ${cx - r} ${bottomY} A ${r} ${ry} 0 0 0 ${cx + r} ${bottomY}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="2"/>`,
  );
  parts.push(
    `<path d="M ${cx - r} ${bottomY} A ${r} ${ry} 0 0 1 ${cx + r} ${bottomY}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="1" stroke-dasharray="6,4"/>`,
  );

  parts.push(prim.line([cx, topY], [cx, bottomY], { dashed: true, strokeWidth: 1 }));

  if (showDim) {
    parts.push(prim.text(cx + 12, (topY + bottomY) / 2, `${h}`, { fontSize: 12 }));
    parts.push(prim.text(cx + r / 2, bottomY + 16, `${r}`, { fontSize: 12 }));
  }

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}

function renderSphere(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const r = dim.radius ?? 80;
  const cx = 150;
  const cy = 150;
  const parts: string[] = [];

  parts.push(prim.circle(cx, cy, r));

  parts.push(
    `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.3}" fill="none" stroke="${prim.STYLE.MAIN_STROKE}" stroke-width="1" stroke-dasharray="6,4"/>`,
  );

  parts.push(prim.dot(cx, cy));

  if (showDim) {
    parts.push(prim.line([cx, cy], [cx + r, cy], { strokeWidth: 1 }));
    parts.push(prim.text(cx + r / 2, cy - 10, `r=${r}`, { fontSize: 12 }));
  }

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}

function renderPrism(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const w = dim.width ?? 80;
  const h = dim.height ?? 100;
  const d = dim.depth ?? 60;
  const cx = 150;
  const cy = 140;
  const parts: string[] = [];

  const front = [
    [cx - w / 2, cy + h / 2],
    [cx + w / 2, cy + h / 2],
    [cx, cy - h / 2],
  ] as [number, number][];

  const offset = d * 0.6;
  const back = front.map(([x, y]) => [x + offset, y - offset * 0.5] as [number, number]);

  parts.push(prim.polygon(front));

  parts.push(prim.line(back[0], back[1], { dashed: true, strokeWidth: 1 }));
  parts.push(prim.line(back[1], back[2]));
  parts.push(prim.line(back[2], back[0], { dashed: true, strokeWidth: 1 }));

  parts.push(prim.line(front[0], back[0], { dashed: true, strokeWidth: 1 }));
  parts.push(prim.line(front[1], back[1]));
  parts.push(prim.line(front[2], back[2]));

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}

function renderPyramid(
  dim: Record<string, number>,
  showDim?: boolean,
  labels?: SolidFigureDiagram["labels"],
): string {
  const base = dim.base ?? dim.width ?? 100;
  const h = dim.height ?? 120;
  const cx = 150;
  const topY = 50;
  const bottomY = topY + h;
  const offset = base * 0.25;
  const parts: string[] = [];

  parts.push(prim.dot(cx, topY, 3));

  const b1: [number, number] = [cx - base / 2, bottomY];
  const b2: [number, number] = [cx + base / 2, bottomY];
  const b3: [number, number] = [cx + base / 2 + offset, bottomY - offset * 0.5];
  const b4: [number, number] = [cx - base / 2 + offset, bottomY - offset * 0.5];

  parts.push(prim.line(b1, b2));
  parts.push(prim.line(b2, b3));
  parts.push(prim.line(b3, b4, { dashed: true, strokeWidth: 1 }));
  parts.push(prim.line(b4, b1, { dashed: true, strokeWidth: 1 }));

  parts.push(prim.line([cx, topY], b1));
  parts.push(prim.line([cx, topY], b2));
  parts.push(prim.line([cx, topY], b3));
  parts.push(prim.line([cx, topY], b4, { dashed: true, strokeWidth: 1 }));

  const baseCenter: [number, number] = [
    (b1[0] + b2[0] + b3[0] + b4[0]) / 4,
    (b1[1] + b2[1] + b3[1] + b4[1]) / 4,
  ];
  parts.push(prim.line([cx, topY], baseCenter, { dashed: true, strokeWidth: 1 }));

  if (showDim) {
    parts.push(prim.text(cx + 12, (topY + bottomY) / 2, `${h}`, { fontSize: 12 }));
  }

  if (labels) parts.push(prim.renderLabels(labels));
  return parts.join("\n");
}
