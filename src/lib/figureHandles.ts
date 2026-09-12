import { editFigureObject, figureObjects } from "./figureSvgEditing.js";

type FigureObject = ReturnType<typeof figureObjects>[number];
export interface FigureHandle { key: string; x: number; y: number; label: string; control?: boolean }
type Segment = { command: string; values: number[] };

/** Normalize the editable path subset to absolute coordinates; preserve unsupported paths intact. */
function pathSegments(d: string): Segment[] | null {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) ?? [];
  const sizes: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0 };
  const segments: Segment[] = [];
  let i = 0, command = '', x = 0, y = 0, startX = 0, startY = 0;
  while (i < tokens.length) {
    if (/^[a-z]$/i.test(tokens[i])) command = tokens[i++];
    const upper = command.toUpperCase(), size = sizes[upper];
    if (size === undefined) return null;
    if (upper === 'Z') { segments.push({ command: 'Z', values: [] }); x = startX; y = startY; command = ''; continue; }
    const values = tokens.slice(i, i + size).map(Number);
    if (values.length !== size || !values.every(Number.isFinite)) return null;
    i += size;
    const relative = command !== upper;
    if (upper === 'H') { x = values[0] + (relative ? x : 0); segments.push({ command: 'L', values: [x, y] }); }
    else if (upper === 'V') { y = values[0] + (relative ? y : 0); segments.push({ command: 'L', values: [x, y] }); }
    else {
      const absolute = values.map((v, index) => v + (relative ? index % 2 ? y : x : 0));
      x = absolute.at(-2)!; y = absolute.at(-1)!;
      segments.push({ command: upper, values: absolute });
      if (upper === 'M') { startX = x; startY = y; command = relative ? 'l' : 'L'; }
    }
  }
  return segments;
}
const number = (o: FigureObject, key: string) => Number(o.attrs[key]) || 0;
const corners = (x: number, y: number, width: number, height: number): FigureHandle[] =>
  [[x, y], [x + width, y], [x + width, y + height], [x, y + height]].map(([x, y], i) => ({ key: `corner-${i}`, x, y, label: `모서리 ${i + 1}` }));

export function figureHandles(object: FigureObject): FigureHandle[] {
  const n = (key: string) => number(object, key);
  if (object.type === 'line') return [{ key: 'start', x: n('x1'), y: n('y1'), label: '시작점' }, { key: 'end', x: n('x2'), y: n('y2'), label: '끝점' }];
  if (object.type === 'circle' || object.type === 'ellipse') {
    const x = n('cx'), y = n('cy'), rx = n(object.type === 'circle' ? 'r' : 'rx'), ry = n(object.type === 'circle' ? 'r' : 'ry');
    return [{ key: 'center', x, y, label: '중심 이동' },
      ...[[x + rx, y], [x, y + ry], [x - rx, y], [x, y - ry]].map(([x, y], i) => ({ key: `radius-${i}`, x, y, label: `크기 조절 ${i + 1}` }))];
  }
  if (object.type === 'rect') return corners(n('x'), n('y'), n('width'), n('height'));
  if (object.type === 'polygon' || object.type === 'polyline') {
    const values = object.attrs.points?.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    return values.length > 64 ? [] : values.flatMap((x, i) => i % 2 || i + 1 >= values.length ? [] : [{ key: `point-${i}`, x, y: values[i + 1], label: `꼭짓점 ${i / 2 + 1}` }]);
  }
  if (object.type === 'path') {
    const segments = pathSegments(object.attrs.d ?? '');
    const points = segments?.flatMap((s, i) => s.values.flatMap((x, j) => j % 2 ? [] : [{ key: `path-${i}-${j}`, x, y: s.values[j + 1],
      label: j + 2 < s.values.length ? '휘어짐 조절' : '꼭짓점', control: j + 2 < s.values.length }])) ?? [];
    return points.length <= 32 ? points : [];
  }
  return [];
}

export function moveFigureHandle(svg: string, id: string, key: string, to: { x: number; y: number }): string {
  const object = figureObjects(svg).find(o => o.id === id);
  if (!object) return svg;
  const n = (name: string) => number(object, name);
  const attrs: Record<string, string> = {};
  const set = (key: string, value: number) => { attrs[key] = String(Math.round(value * 100) / 100); };
  if (object.type === 'line') { set(key === 'start' ? 'x1' : 'x2', to.x); set(key === 'start' ? 'y1' : 'y2', to.y); }
  else if (key === 'center') { set('cx', to.x); set('cy', to.y); }
  else if (key.startsWith('radius-')) {
    if (object.type === 'circle') set('r', Math.max(1, Math.hypot(to.x - n('cx'), to.y - n('cy'))));
    else if (Number(key.slice(-1)) % 2) set('ry', Math.max(1, Math.abs(to.y - n('cy'))));
    else set('rx', Math.max(1, Math.abs(to.x - n('cx'))));
  } else if (object.type === 'rect') {
    const opposite = corners(n('x'), n('y'), n('width'), n('height'))[(Number(key.slice(-1)) + 2) % 4];
    set('x', Math.min(to.x, opposite.x)); set('y', Math.min(to.y, opposite.y));
    set('width', Math.max(1, Math.abs(to.x - opposite.x))); set('height', Math.max(1, Math.abs(to.y - opposite.y)));
  } else if (key.startsWith('point-')) {
    const values = object.attrs.points.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)!.map(Number);
    const index = Number(key.slice(6)); values[index] = to.x; values[index + 1] = to.y;
    attrs.points = values.join(' ');
  } else if (key.startsWith('path-')) {
    const segments = pathSegments(object.attrs.d)!;
    const [, segment, index] = key.split('-').map(Number);
    segments[segment].values[index] = to.x; segments[segment].values[index + 1] = to.y;
    attrs.d = segments.map(s => `${s.command} ${s.values.map(v => Math.round(v * 100) / 100).join(' ')}`).join(' ');
  }
  return editFigureObject(svg, id, attrs);
}

/** Forgiving selection around thin strokes, measured in screen pixels at every zoom level. */
export function hitFigureObject(root: SVGSVGElement, clientX: number, clientY: number): SVGGraphicsElement | null {
  let closest: SVGGraphicsElement | null = null, distance = 9;
  for (const element of root.querySelectorAll<SVGGraphicsElement>('[data-object-id]')) {
    const rect = element.getBoundingClientRect();
    if (clientX < rect.left - 9 || clientX > rect.right + 9 || clientY < rect.top - 9 || clientY > rect.bottom + 9) continue;
    const matrix = element.getScreenCTM(); if (!matrix) continue;
    if (element instanceof SVGGeometryElement) {
      const length = element.getTotalLength(), scale = Math.hypot(matrix.a, matrix.b);
      const count = Math.min(1500, Math.max(2, Math.ceil(length * scale / 4)));
      for (let i = 0; i <= count; i++) {
        const at = element.getPointAtLength(length * i / count).matrixTransform(matrix);
        const d = Math.hypot(at.x - clientX, at.y - clientY);
        if (d <= distance) { distance = d; closest = element; }
      }
    } else if (clientX >= rect.left - 4 && clientX <= rect.right + 4 && clientY >= rect.top - 4 && clientY <= rect.bottom + 4) closest = element;
  }
  return closest;
}
