import type { GeneratedProblem } from '../types';
import type { ContentBlock } from '../types/ocrBlocks';
import type { EngineBlock } from '../types/testchange';
import type { HwpPayload } from '../services/api/hwpConnector';
import { renderDiagram } from './diagram';

/** Preserve the figure's position across the stem, choices and subquestions. */
export function problemFigureBlocks(p: GeneratedProblem) {
  const images: EngineBlock[] = (p.images ?? []).map(im => ({ type: 'figure', crop: im.dataUrl, desc: im.label }));
  const diagrams: EngineBlock[] = p.diagramParams?.length
    ? p.diagramParams.map(spec => ({ type: 'figure', svg: renderDiagram(spec) }))
    : p.diagramSVG ? [{ type: 'figure', svg: p.diagramSVG }] : [];
  const assets = images.length ? images : diagrams;
  const used = new Set<number>();
  const blocks = (input: ContentBlock[]): EngineBlock[] => input.flatMap(b => {
    if (b.type !== 'text') return [{ ...b }];
    if (/※\s*그림 자리/.test(b.value)) throw new Error(`${p.number ?? ''}번 도형의 원본 이미지가 없습니다. 원본 PDF를 다시 인식해 도형을 확인해 주세요.`);
    const out: EngineBlock[] = [];
    const pattern = /<svg\b[\s\S]*?<\/svg>|\[그림\s*(\d+)\]/gi;
    let cursor = 0;
    for (const match of b.value.matchAll(pattern)) {
      if (match.index! > cursor) out.push({ type: 'text', value: b.value.slice(cursor, match.index), rows: [] });
      if (match[1]) {
        const index = Number(match[1]) - 1;
        if (!assets[index]) throw new Error(`${p.number ?? ''}번 그림${index + 1} 이미지가 없습니다. 인식 검토에서 도형을 확인해 주세요.`);
        out.push({ ...assets[index] }); used.add(index);
      } else out.push({ type: 'figure', svg: match[0] });
      cursor = match.index! + match[0].length;
    }
    if (cursor < b.value.length) out.push({ ...b, value: b.value.slice(cursor) });
    return out;
  });
  const contents = blocks(p.blocks?.length ? p.blocks : [{ type: 'text', value: p.question || '', rows: [] }]);
  const choices = (p.choiceGroups?.length ? p.choiceGroups : (p.choices ?? []).map((value, i) =>
    ({ number: i + 1, contents: [{ type: 'text' as const, value, rows: [] }] })))
    .map(c => ({ number: c.number, contents: blocks(c.contents) }));
  const subQuestions = (p.subQuestions ?? []).map(q => ({ number: q.number, contents: blocks(q.contents),
    choices: q.choices?.map(c => ({ number: c.number, contents: blocks(c.contents) })),
    score: q.printedScore ?? q.score, labelType: q.labelType }));
  assets.forEach((b, i) => { if (!used.has(i)) contents.push({ ...b }); });
  return { contents, choices, subQuestions };
}

/** Export the displayed (typeset, edited) SVG, without asking an older helper to redraw its spec. */
export async function figureToPng(source: string): Promise<string> {
  const url = source.trim().startsWith('<svg')
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}` : source;
  if (!/^(data:image\/|https?:\/\/|blob:)/.test(url)) throw new Error('도형 이미지 형식이 올바르지 않습니다.');
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { img.src = ''; reject(new Error('도형 이미지를 불러오는 시간이 초과되었습니다.')); }, 15000);
    img.onload = () => { clearTimeout(timer); resolve(); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('도형 이미지를 불러오지 못했습니다. 인식 검토에서 그림을 확인해 주세요.')); };
    img.src = url;
  });
  const scale = Math.min(3, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.ceil(img.naturalHeight * scale));
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('도형 이미지를 만들 수 없습니다.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { canvas.width = 0; canvas.height = 0; }
}

export function hasHwpFigures(payload: HwpPayload): boolean {
  return payload.problems.some(q => [q.contents, ...(q.choices ?? []).map(c => c.contents),
    ...(q.subQuestions ?? []).flatMap(s => [s.contents, ...(s.choices ?? []).map(c => c.contents)])]
    .some(blocks => blocks?.some(b => b.type === 'figure')));
}

export async function prepareHwpFigures(payload: HwpPayload): Promise<HwpPayload> {
  const prepared = structuredClone(payload);
  for (const q of prepared.problems) {
    const groups = [q.contents, ...(q.choices ?? []).map(c => c.contents),
      ...(q.subQuestions ?? []).flatMap(s => [s.contents, ...(s.choices ?? []).map(c => c.contents)])];
    for (const blocks of groups) for (const b of blocks ?? []) {
      if (b.type !== 'figure') continue;
      const source = b.crop || b.svg;
      if (!source) throw new Error(`${q.number}번 도형 이미지가 없습니다.`);
      b.crop = await figureToPng(source);
      delete b.svg; delete b.spec;
    }
  }
  return prepared;
}
